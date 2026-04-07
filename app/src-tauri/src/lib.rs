pub mod nexus {
    tonic::include_proto!("nexus");
}

use tauri::Emitter;

use std::process::Child;
use std::sync::Mutex;

struct SimulatorState(Mutex<Option<Child>>);

#[tauri::command]
async fn connect_simulator(app: tauri::AppHandle) -> Result<(), String> {
    let address = "http://127.0.0.1:50052";
    println!("Connecting to simulator at: {}", address);
    
    let mut retries = 5;
    let mut client_opt = None;
    
    while retries > 0 {
        match nexus::nexus_service_client::NexusServiceClient::connect(address).await {
            Ok(client) => {
                client_opt = Some(client);
                break;
            }
            Err(_e) => {
                println!("Connection failed, retrying... ({} attempts left)", retries - 1);
                retries -= 1;
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            }
        }
    }
    
    let mut client = client_opt.ok_or_else(|| "Failed to connect to simulator after retries".to_string())?;

    println!("Connected successfully!");

    println!("Starting StreamEvents...");
    let response = client
        .stream_events(nexus::StreamRequest { live: true })
        .await
        .map_err(|e| {
            println!("StreamEvents failed: {}", e);
            e.to_string()
        })?;
    println!("StreamEvents started!");

    let mut stream = response.into_inner();

    tauri::async_runtime::spawn(async move {
        while let Ok(Some(event)) = stream.message().await {
            let _ = app.emit("simulation-event", event);
        }
    });

    Ok(())
}

#[tauri::command]
async fn set_simulation_speed(speed: f32) -> Result<(), String> {
    let address = "http://127.0.0.1:50052";
    println!("Setting simulation speed to {} at {}", speed, address);
    let mut client = nexus::nexus_service_client::NexusServiceClient::connect(address)
        .await
        .map_err(|e| e.to_string())?;
    
    let _response = client
        .set_speed(nexus::SetSpeedRequest { speed_factor: speed })
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
async fn set_node_state(node_id: u32, enabled: bool) -> Result<(), String> {
    let address = "http://127.0.0.1:50052";
    println!("Setting node {} enabled state to {} at {}", node_id, enabled, address);
    let mut client = nexus::nexus_service_client::NexusServiceClient::connect(address)
        .await
        .map_err(|e| e.to_string())?;
    
    let _response = client
        .set_node_state(nexus::SetNodeStateRequest { node_id, enabled })
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
async fn set_node_position(node_id: u32, x: f32, y: f32) -> Result<(), String> {
    let address = "http://127.0.0.1:50052";
    println!("Setting node {} coordinates to ({}, {}) at {}", node_id, x, y, address);
    let mut client = nexus::nexus_service_client::NexusServiceClient::connect(address)
        .await
        .map_err(|e| e.to_string())?;
    
    let _response = client
        .set_node_position(nexus::SetNodePositionRequest { node_id, x, y })
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
async fn create_node(x: f32, y: f32) -> Result<u32, String> {
    println!("Tauri: create_node called with x={}, y={}", x, y);
    let address = "http://127.0.0.1:50052";
    let mut client = nexus::nexus_service_client::NexusServiceClient::connect(address)
        .await
        .map_err(|e| e.to_string())?;
    
    let response = client
        .create_node(nexus::CreateNodeRequest { x, y })
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(response.into_inner().node_id)
}

#[tauri::command]
async fn form_network(node_id: u32) -> Result<(), String> {
    println!("Tauri: form_network called for node {}", node_id);
    let address = "http://127.0.0.1:50052";
    let mut client = nexus::nexus_service_client::NexusServiceClient::connect(address)
        .await
        .map_err(|e| e.to_string())?;
    
    let _response = client
        .form_network(nexus::FormNetworkRequest { node_id })
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
async fn join_network(node_id: u32, target_node_id: u32, mode: String) -> Result<(), String> {
    println!("Tauri: join_network called for node {} to target {} as {}", node_id, target_node_id, mode);
    let address = "http://127.0.0.1:50052";
    let mut client = nexus::nexus_service_client::NexusServiceClient::connect(address)
        .await
        .map_err(|e| e.to_string())?;
    
    let join_mode = match mode.as_str() {
        "ftd" => 0, // JOIN_MODE_FTD
        "med" => 1, // JOIN_MODE_MED
        "sed" => 2, // JOIN_MODE_SED
        "fed" => 3, // JOIN_MODE_FED
        _ => return Err(format!("Invalid join mode: {}", mode)),
    };

    let _response = client
        .join_network(nexus::JoinNetworkRequest { 
            node_id, 
            target_node_id, 
            mode: join_mode 
        })
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
async fn reset_simulator(state: tauri::State<'_, SimulatorState>) -> Result<(), String> {
    let mut child_lock = state.0.lock().unwrap();
    if let Some(mut child) = child_lock.take() {
        println!("Killing existing nexus_live_demo process for reset...");
        let _ = child.kill();
    }

    println!("Spawning fresh nexus_live_demo process...");
    let new_child = std::process::Command::new("/Users/jonhui/jwhui/ot-nexus/openthread/nexus_native_build/tests/nexus/nexus_live_demo")
        .spawn()
        .map_err(|e| format!("Failed to respawn simulator: {}", e))?;
    
    *child_lock = Some(new_child);
    Ok(())
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(SimulatorState(Mutex::new(None)))
        .setup(|app| {
            use tauri::Manager;
            let state = app.state::<SimulatorState>();
            let child = std::process::Command::new("/Users/jonhui/jwhui/ot-nexus/openthread/nexus_native_build/tests/nexus/nexus_live_demo")
                .spawn()
                .expect("failed to spawn nexus_live_demo");
            *state.0.lock().unwrap() = Some(child);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![connect_simulator, set_simulation_speed, reset_simulator, set_node_state, set_node_position, create_node, form_network, join_network])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            use tauri::Manager;
            let child_proc = app_handle.state::<SimulatorState>().0.lock().unwrap().take();
            if let Some(mut child) = child_proc {
                println!("Terminating nexus_live_demo process...");
                let _ = child.kill();
            }
        }
    });
}
