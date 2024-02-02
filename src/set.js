const { writeTextFile } = window.__TAURI__.fs

$('#settingsSave').click(async () => {
    await writeTextFile('./app.conf', 'file contents');
})