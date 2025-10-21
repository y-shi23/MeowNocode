#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde_json::json;
use tauri::{LogicalSize, Size, Window, WindowEvent};

fn emit_window_state(window: &Window) {
    let fullscreen = window.is_fullscreen().unwrap_or(false);
    let maximized = window.is_maximized().unwrap_or(false);

    let _ = window.emit(
        "app://window-state",
        json!({
            "label": window.label(),
            "fullscreen": fullscreen,
            "maximized": maximized,
        }),
    );
}

fn main() {
    tauri::Builder::default()
        .on_window_event(|event| {
            let window = event.window();

            match event.event() {
                WindowEvent::ScaleFactorChanged { scale_factor, .. } => {
                    let scale = *scale_factor;
                    let mut logical_width = None;
                    let mut logical_height = None;

                    if let Ok(inner_size) = window.inner_size() {
                        let logical_size = inner_size.to_logical::<f64>(scale);
                        let _ = window.set_size(Size::Logical(logical_size));
                        logical_width = Some(logical_size.width);
                        logical_height = Some(logical_size.height);
                    }

                    let _ = window.emit(
                        "app://dpi-changed",
                        json!({
                            "label": window.label(),
                            "scaleFactor": scale,
                            "logicalWidth": logical_width,
                            "logicalHeight": logical_height,
                        }),
                    );

                    emit_window_state(window);
                }
                WindowEvent::Resized(_) => {
                    emit_window_state(window);
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Meow App desktop");
}
