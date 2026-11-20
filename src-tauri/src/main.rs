use rusqlite::Connection;
use tauri::Manager;

fn database(app: &tauri::AppHandle) -> Result<Connection,String> {
    let dir = app.path().app_data_dir().map_err(|e|e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e|e.to_string())?;
    let db = Connection::open(dir.join("pingboard.sqlite")).map_err(|e|e.to_string())?;
    db.busy_timeout(std::time::Duration::from_secs(5)).map_err(|e|e.to_string())?;
    db.execute_batch(include_str!("initialize.sql")).map_err(|e|e.to_string())?;
    Ok(db)
}

#[tauri::command]
fn load_tasks(app: tauri::AppHandle) -> Result<String,String> {
    database(&app)?.query_row(include_str!("load.sql"), [], |row|row.get(0)).map_err(|e|e.to_string())
}

#[derive(serde::Deserialize, serde::Serialize)]
struct ReminderChange {
    id: String,
    title: String,
    epoch: f64,
}

#[tauri::command]
fn save_tasks(app: tauri::AppHandle, data: String, reminders: Vec<ReminderChange>, settings: Option<String>) -> Result<(),String> {
    serde_json::from_str::<Vec<serde_json::Value>>(&data).map_err(|e|e.to_string())?;
    let mut db = database(&app)?;
    let transaction = db.transaction().map_err(|e|e.to_string())?;
    transaction.execute(include_str!("save.sql"), [data]).map_err(|e|e.to_string())?;
    if let Some(settings) = settings {
        transaction.execute(include_str!("save_settings.sql"), [settings]).map_err(|e|e.to_string())?;
    }
    for change in reminders {
        let payload = serde_json::to_string(&change).map_err(|e|e.to_string())?;
        transaction.execute("INSERT OR REPLACE INTO pending_reminders VALUES (?1, ?2)", [&change.id, &payload]).map_err(|e|e.to_string())?;
    }
    transaction.commit().map_err(|e|e.to_string())
}

#[tauri::command]
fn load_pending_reminders(app: tauri::AppHandle) -> Result<String,String> {
    database(&app)?.query_row("SELECT json_group_array(json(payload)) FROM pending_reminders", [], |row|row.get(0)).map_err(|e|e.to_string())
}

#[tauri::command]
fn ack_reminder(app: tauri::AppHandle, id: String, title: String, epoch: f64) -> Result<(),String> {
    let payload = serde_json::to_string(&ReminderChange { id: id.clone(), title, epoch }).map_err(|e|e.to_string())?;
    database(&app)?.execute("DELETE FROM pending_reminders WHERE id = ?1 AND payload = ?2", [id, payload]).map_err(|e|e.to_string())?;
    Ok(())
}

#[tauri::command]
fn write_backup(app: tauri::AppHandle, data: String) -> Result<String,String> {
    use std::io::Write;

    let path = app.path().download_dir().map_err(|e|e.to_string())?
        .join(format!("Pingboard-{}.json", std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH).map_err(|e|e.to_string())?.as_nanos()));
    let mut file = std::fs::OpenOptions::new().write(true).create_new(true)
        .open(&path).map_err(|e|e.to_string())?;
    if let Err(error) = file.write_all(data.as_bytes()).and_then(|_| file.sync_all()) {
        drop(file);
        let _ = std::fs::remove_file(&path);
        return Err(error.to_string());
    }
    Ok(path.display().to_string())
}

#[tauri::command]
fn load_settings(app: tauri::AppHandle) -> Result<String,String> {
    database(&app)?.query_row(include_str!("load_settings.sql"), [], |row|row.get(0)).map_err(|e|e.to_string())
}

#[tauri::command]
fn save_settings(app: tauri::AppHandle, data: String) -> Result<(),String> {
    serde_json::from_str::<serde_json::Map<String,serde_json::Value>>(&data).map_err(|e|e.to_string())?;
    database(&app)?.execute(include_str!("save_settings.sql"), [data]).map_err(|e|e.to_string())?;
    Ok(())
}

extern "C" {
    fn pingboard_reminder(id:*const std::ffi::c_char,title:*const std::ffi::c_char,epoch:f64, token:usize, done:extern "C" fn(usize,i32));
}

extern "C" fn finished(token:usize,status:i32) {
    // Swift calls back once and releases the sender allocated for this request.
    let sender=unsafe {Box::from_raw(token as *mut std::sync::mpsc::Sender<i32>)};
    let _=sender.send(status);
}

#[tauri::command]
async fn reminder(id:String,title:String,epoch:f64)->Result<(),String>{
    tauri::async_runtime::spawn_blocking(move || {
        let id=std::ffi::CString::new(id).map_err(|e|e.to_string())?;
        let title=std::ffi::CString::new(title).map_err(|e|e.to_string())?;
        let (sender,receiver)=std::sync::mpsc::channel::<i32>();
        unsafe {pingboard_reminder(id.as_ptr(),title.as_ptr(),epoch,Box::into_raw(Box::new(sender)) as usize,finished)};
        match receiver.recv(){Ok(0)=>Ok(()),_=>Err("Проверь разрешение на уведомления в настройках macOS".to_string())}
    }).await.map_err(|e|e.to_string())?
}

fn main() {
    tauri::Builder::default().invoke_handler(tauri::generate_handler![load_tasks,save_tasks,load_settings,save_settings,reminder,load_pending_reminders,ack_reminder,write_backup])
        .run(tauri::generate_context!()).expect("Pingboard failed to start");
}
