use std::collections::HashMap;
use std::process::Child;
use std::sync::{Arc, Mutex};

pub type SharedChild = Arc<Mutex<Child>>;

#[derive(Default)]
pub struct AppState {
    pub tasks: Mutex<HashMap<String, SharedChild>>,
}

impl AppState {
    pub fn new() -> Self {
        Self::default()
    }
}
