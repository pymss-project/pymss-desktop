import { onBeforeUnmount, type Ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { convertFileSrc } from '@tauri-apps/api/core'
import type { EditorSource, EditorTrack } from '@/types/editor'
import type { useEditorStore } from '@/stores/editor'
import { useEditorPlaybackStore } from '@/stores/editorPlayback'

type EditorStore = ReturnType<typeof useEditorStore>

type PlaybackOptions = {
  editor: EditorStore
  scrollEl: Ref<HTMLElement | null>
  trackHeaderWidth?: number
}

type ActiveTrackEntry = {
  track: EditorTrack
  source: EditorSource
}

type ManagedAudio = {
  trackId: string
  sourceId: string
  audio: HTMLAudioElement
  metadataReady: boolean
  metadataPromise: Promise<void>
}

type FollowPlayheadMode = 'playback' | 'seek'

const ERROR_SESSION_NOT_LOADED = '请先加载编辑工程'
const ERROR_NO_PLAYABLE_TRACKS = '当前没有可播放的音轨'
const ERROR_NO_LOADED_AUDIO = '没有成功加载任何音频'

export function useEditorPlayback(options: PlaybackOptions) {
  const { editor, scrollEl } = options
  const trackHeaderWidth = options.trackHeaderWidth ?? 0
  const playback = useEditorPlaybackStore()
  const {
    intent,
    status,
    currentTime,
    loop,
    level,
    error,
    requestId,
    transportVisualState,
    transportPendingAction,
    transportCanToggle,
    isBusy,
    isActuallyPlaying,
  } = storeToRefs(playback)
  const shouldFollowPlayhead = isActuallyPlaying

  const audioEntries = new Map<string, ManagedAudio>()

  let rafId: number | null = null
  let playbackAnchorTime = 0
  let activeRequestId = 0
  let followScrollRafId: number | null = null
  let followScrollTargetLeft = 0
  function resolveAudioUrl(path: string) {
    try {
      return convertFileSrc(path)
    } catch {
      return path
    }
  }

  function computeDuration() {
    return Math.max(0, editor.duration || 0)
  }

  function clampTime(time: number, duration = computeDuration()) {
    return Math.max(0, Math.min(time, duration))
  }

  function activeTracks() {
    const session = editor.session
    if (!session) return []
    const hasSolo = session.tracks.some((track) => track.solo)
    return session.tracks
      .filter((track) => !track.muted && (!hasSolo || track.solo))
      .map((track) => {
        const source = editor.sourceMap.get(track.sourceId)
        return source ? { track, source } : null
      })
      .filter((entry): entry is ActiveTrackEntry => Boolean(entry))
  }

  function trackSignature() {
    return activeTracks()
      .map(({ track, source }) => [track.id, source.id, track.volume, track.muted, track.solo, track.fadeIn, track.fadeOut].join(':'))
      .join('|')
  }

  function createMetadataPromise(audio: HTMLAudioElement, entry: ManagedAudio) {
    return new Promise<void>((resolve) => {
      if (audio.readyState >= 1) {
        entry.metadataReady = true
        resolve()
        return
      }

      const cleanup = () => {
        audio.removeEventListener('loadedmetadata', onReady)
        audio.removeEventListener('canplay', onReady)
        audio.removeEventListener('error', onDone)
      }

      const onReady = () => {
        cleanup()
        entry.metadataReady = true
        resolve()
      }

      const onDone = () => {
        cleanup()
        resolve()
      }

      audio.addEventListener('loadedmetadata', onReady, { once: true })
      audio.addEventListener('canplay', onReady, { once: true })
      audio.addEventListener('error', onDone, { once: true })
    })
  }

  function ensureAudioEntry(track: EditorTrack, source: EditorSource) {
    const cached = audioEntries.get(track.id)
    if (cached && cached.sourceId === source.id) return cached

    if (cached) {
      cached.audio.pause()
      cached.audio.removeAttribute('src')
      cached.audio.load()
      audioEntries.delete(track.id)
    }

    const audio = new Audio(resolveAudioUrl(source.path))
    audio.preload = 'auto'
    audio.loop = false

    const entry: ManagedAudio = {
      trackId: track.id,
      sourceId: source.id,
      audio,
      metadataReady: audio.readyState >= 1,
      metadataPromise: Promise.resolve(),
    }

    entry.metadataPromise = createMetadataPromise(audio, entry)
    audioEntries.set(track.id, entry)
    audio.load()
    return entry
  }

  function setAudioTime(audio: HTMLAudioElement, time: number) {
    const maxTime = Number.isFinite(audio.duration) && audio.duration > 0
      ? Math.max(0, audio.duration - 0.01)
      : time
    const next = Math.max(0, Math.min(time, maxTime))
    try {
      audio.currentTime = next
    } catch {
      // ignore early metadata timing errors
    }
  }

  function computeTrackVolume(track: EditorTrack, source: EditorSource, time: number) {
    let gain = Math.max(0, track.volume) * Math.max(0, editor.masterVolume)
    const duration = Math.max(0, Number(source.duration || 0))
    const fadeIn = Math.max(0, Number(track.fadeIn || 0))
    const fadeOut = Math.max(0, Number(track.fadeOut || 0))

    if (fadeIn > 0 && time < fadeIn) {
      gain *= Math.max(0, Math.min(1, time / fadeIn))
    }

    if (fadeOut > 0 && duration > 0) {
      const fadeOutStart = Math.max(0, duration - fadeOut)
      if (time > fadeOutStart) {
        gain *= Math.max(0, Math.min(1, (duration - time) / fadeOut))
      }
    }

    return Math.max(0, Math.min(1, gain))
  }

  function pauseInactiveAudios(activeIds: Set<string>) {
    audioEntries.forEach((entry, trackId) => {
      if (activeIds.has(trackId)) return
      entry.audio.pause()
      entry.audio.muted = true
    })
  }

  function applyTrackVolumes(time = currentTime.value) {
    const entries = activeTracks()
    const activeIds = new Set(entries.map(({ track }) => track.id))

    for (const { track, source } of entries) {
      const entry = ensureAudioEntry(track, source)
      const volume = computeTrackVolume(track, source, time)
      entry.audio.muted = volume <= 0.0001
      entry.audio.volume = Math.min(1, Math.max(0, volume))
    }

    pauseInactiveAudios(activeIds)
  }

  async function preloadActiveTracks() {
    const entries = activeTracks().map(({ track, source }) => ensureAudioEntry(track, source))
    await Promise.allSettled(entries.map((entry) => entry.metadataPromise))
  }

  function animateFollowScroll(targetLeft: number) {
    const el = scrollEl.value
    if (!el) return

    followScrollTargetLeft = targetLeft

    if (Math.abs(el.scrollLeft - targetLeft) < 1) {
      el.scrollLeft = targetLeft
      stopFollowScroll()
      return
    }

    if (followScrollRafId !== null) return

    const step = () => {
      const host = scrollEl.value
      if (!host) {
        stopFollowScroll()
        return
      }

      const delta = followScrollTargetLeft - host.scrollLeft
      if (Math.abs(delta) < 1) {
        host.scrollLeft = followScrollTargetLeft
        stopFollowScroll()
        return
      }

      host.scrollLeft += delta * 0.2
      followScrollRafId = requestAnimationFrame(step)
    }

    followScrollRafId = requestAnimationFrame(step)
  }

  function followPlayhead(mode: FollowPlayheadMode = 'playback') {
    const el = scrollEl.value
    if (!el) return
    const x = trackHeaderWidth + currentTime.value * editor.pixelsPerSecond
    const maxScrollLeft = Math.max(0, el.scrollWidth - el.clientWidth)
    const clampedX = Math.max(trackHeaderWidth, Math.min(trackHeaderWidth + computeDuration() * editor.pixelsPerSecond, x))

    if (mode === 'seek') {
      const targetLeft = Math.max(0, Math.min(maxScrollLeft, clampedX - el.clientWidth * 0.5))
      animateFollowScroll(targetLeft)
      return
    }

    const leftGuard = el.scrollLeft + Math.min(48, el.clientWidth * 0.08)
    const rightGuard = el.scrollLeft + el.clientWidth * 0.7
    if (clampedX < leftGuard || clampedX > rightGuard) {
      const targetLeft = Math.max(0, Math.min(maxScrollLeft, clampedX - el.clientWidth * 0.4))
      animateFollowScroll(targetLeft)
    }
  }

  function stopFollowScroll() {
    if (followScrollRafId !== null) {
      cancelAnimationFrame(followScrollRafId)
      followScrollRafId = null
    }
  }

  function stopRaf() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    stopFollowScroll()
  }

  function pauseAllAudios() {
    audioEntries.forEach((entry) => {
      entry.audio.pause()
    })
  }

  function syncPauseAt(time: number) {
    pauseAllAudios()
    audioEntries.forEach((entry) => setAudioTime(entry.audio, time))
  }

  function sampleCurrentTime() {
    const samples: number[] = []
    for (const { track } of activeTracks()) {
      const entry = audioEntries.get(track.id)
      if (entry && !entry.audio.paused) samples.push(entry.audio.currentTime)
    }
    if (samples.length) return Math.max(...samples)
    if (status.value !== 'playing') return currentTime.value
    return Math.max(0, performance.now() / 1000 - playbackAnchorTime)
  }

  function updateLevelMeter(time: number) {
    if (status.value !== 'playing') {
      playback.setLevel(0)
      return
    }
    const pulse = 0.2 + Math.abs(Math.sin(time * 3.6)) * 0.28 + Math.abs(Math.sin(time * 7.4)) * 0.1
    playback.setLevel(pulse)
  }

  function releaseAudios() {
    pauseAllAudios()
    audioEntries.forEach((entry) => {
      entry.audio.removeAttribute('src')
      entry.audio.load()
    })
    audioEntries.clear()
  }

  function finishPaused(id: number, time: number) {
    stopRaf()
    syncPauseAt(time)
    playback.setCurrentTime(clampTime(time))
    playback.finishPause(id)
  }

  function syncPausedAudiosToTime(time: number) {
    const nextTime = clampTime(time)
    playback.setCurrentTime(nextTime)
    playbackAnchorTime = performance.now() / 1000 - nextTime
    applyTrackVolumes(nextTime)

    const entries = activeTracks()
    for (const { track, source } of entries) {
      const entry = ensureAudioEntry(track, source)
      const applySeek = () => setAudioTime(entry.audio, nextTime)
      if (entry.metadataReady) applySeek()
      else void entry.metadataPromise.then(() => {
        if (entry.sourceId !== source.id) return
        applySeek()
      })
    }
  }

  async function syncActiveAudios(playNow: boolean, targetTime = currentTime.value, expectedRequestId = activeRequestId) {
    const entries = activeTracks()
    if (!entries.length) {
      pauseAllAudios()
      return 0
    }

    const activeIds = new Set(entries.map(({ track }) => track.id))
    pauseInactiveAudios(activeIds)

    const managed = entries.map(({ track, source }) => ({
      track,
      source,
      entry: ensureAudioEntry(track, source),
    }))

    const nextTime = clampTime(targetTime)
    playback.setCurrentTime(nextTime)
    playbackAnchorTime = performance.now() / 1000 - nextTime

    for (const { entry } of managed) {
      setAudioTime(entry.audio, nextTime)
      if (!entry.metadataReady) {
        void entry.metadataPromise.then(() => {
          if (expectedRequestId !== activeRequestId) return
          setAudioTime(entry.audio, nextTime)
        })
      }
    }

    applyTrackVolumes(nextTime)

    if (!playNow) return managed.length

    const results = await Promise.allSettled(managed.map(({ entry }) => entry.audio.play()))
    if (expectedRequestId !== activeRequestId) return 0
    const playableCount = results.filter((result) => result.status === 'fulfilled').length
    if (playableCount <= 0) {
      const firstError = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
      throw firstError?.reason || new Error(ERROR_NO_LOADED_AUDIO)
    }
    return playableCount
  }

  async function requestPlay(offset = currentTime.value) {
    playback.clearError()

    if (!editor.session) {
      const id = playback.beginRequest('pause', 'paused')
      activeRequestId = id
      playback.fail(id, ERROR_SESSION_NOT_LOADED)
      return false
    }

    if (!activeTracks().length) {
      const id = playback.beginRequest('pause', 'paused')
      activeRequestId = id
      playback.fail(id, ERROR_NO_PLAYABLE_TRACKS)
      return false
    }

    const id = playback.beginRequest('play', 'starting')
    activeRequestId = id

    const playableCount = await syncActiveAudios(true, offset, id).catch((cause) => {
      if (id !== activeRequestId) return -1
      playback.fail(id, cause instanceof Error ? cause.message : String(cause))
      return 0
    })

    if (id !== activeRequestId) return false
    if (intent.value !== 'play') return false

    if (playableCount <= 0) {
      if (!error.value) playback.fail(id, ERROR_NO_LOADED_AUDIO)
      return false
    }

    if (!playback.finishPlay(id)) return false
    playbackAnchorTime = performance.now() / 1000 - currentTime.value
    followPlayhead('seek')
    stopRaf()
    rafId = requestAnimationFrame(tick)
    return true
  }

  function requestPause(reset = false) {
    const nextTime = reset ? 0 : clampTime(sampleCurrentTime())
    const id = playback.beginRequest('pause', 'pausing')
    activeRequestId = id
    finishPaused(id, nextTime)
    return true
  }

  function toggleTransport() {
    if (intent.value === 'play') {
      requestPause(false)
      return Promise.resolve(true)
    }
    return requestPlay(currentTime.value)
  }

  function stop(reset = true) {
    requestPause(reset)
  }

  function tick() {
    if (intent.value !== 'play' || status.value !== 'playing') {
      stopRaf()
      return
    }

    const time = clampTime(sampleCurrentTime())
    playback.setCurrentTime(time)
    applyTrackVolumes(time)
    updateLevelMeter(time)
    followPlayhead()

    const total = computeDuration()
    if (total > 0 && time >= total - 0.04) {
      if (loop.value && intent.value === 'play') {
        const id = playback.beginRequest('play', 'starting')
        activeRequestId = id
        void syncActiveAudios(true, 0, id).then((count) => {
          if (id !== activeRequestId || intent.value !== 'play') return
          if (count <= 0) {
            playback.fail(id, ERROR_NO_LOADED_AUDIO)
            return
          }
          if (!playback.finishPlay(id)) return
          playback.setCurrentTime(0)
          playbackAnchorTime = performance.now() / 1000
          followPlayhead('seek')
          stopRaf()
          rafId = requestAnimationFrame(tick)
        }).catch((cause) => {
          playback.fail(id, cause instanceof Error ? cause.message : String(cause))
        })
        return
      }

      requestPause(true)
      return
    }

    rafId = requestAnimationFrame(tick)
  }

  function seek(time: number) {
    const next = clampTime(time)
    syncPausedAudiosToTime(next)

    if (intent.value === 'play') {
      followPlayhead('seek')
      const id = playback.beginRequest('play', 'starting')
      activeRequestId = id
      void syncActiveAudios(true, next, id).then((count) => {
        if (id !== activeRequestId || intent.value !== 'play') return
        if (count <= 0) {
          playback.fail(id, ERROR_NO_LOADED_AUDIO)
          return
        }
        if (!playback.finishPlay(id)) return
        stopRaf()
        rafId = requestAnimationFrame(tick)
      }).catch((cause) => {
        playback.fail(id, cause instanceof Error ? cause.message : String(cause))
      })
    }
  }

  function applyMasterVolume() {
    applyTrackVolumes(currentTime.value)
  }

  watch(() => editor.masterVolume, () => {
    applyMasterVolume()
  })

  watch(
    () => editor.session?.id || '',
    () => {
      stop(true)
      releaseAudios()
      playback.clearError()
    },
  )

  watch(
    () => trackSignature(),
    () => {
      if (intent.value === 'play') {
        const id = playback.beginRequest('play', 'starting')
        activeRequestId = id
        void syncActiveAudios(true, currentTime.value, id).then((count) => {
          if (id !== activeRequestId || intent.value !== 'play') return
          if (count <= 0) {
            playback.fail(id, ERROR_NO_LOADED_AUDIO)
            return
          }
          if (!playback.finishPlay(id)) return
          stopRaf()
          rafId = requestAnimationFrame(tick)
        }).catch((cause) => {
          playback.fail(id, cause instanceof Error ? cause.message : String(cause))
        })
      } else {
        syncPausedAudiosToTime(currentTime.value)
        void preloadActiveTracks()
      }
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    stop(true)
    releaseAudios()
  })

  return {
    intent,
    status,
    transportVisualState,
    transportPendingAction,
    transportCanToggle,
    isBusy,
    isActuallyPlaying,
    shouldFollowPlayhead,
    playbackError: error,
    currentTime,
    loop,
    level,
    requestId,
    requestPlay,
    requestPause,
    toggleTransport,
    stop,
    seek,
    applyMasterVolume,
    preloadActiveTracks,
  }
}
