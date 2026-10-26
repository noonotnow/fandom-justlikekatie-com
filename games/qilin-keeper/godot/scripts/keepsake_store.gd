extends RefCounted
## Browser-local / Mac-local keepsakes, independent of the care reset.

signal context_replaced

const IDS := ["first_flight","first_landing"]
const WEB_KEY := "qilin-keeper.keepsakes.v1"
var web_key := WEB_KEY
var browser_callback: JavaScriptObject
var path := "user://qilin-keepsakes.json"
var earned: Array[String] = []
var placed: Dictionary = {}
var last_error := ""
var damaged_save := false
var storage_writable := true

func load_case() -> void:
	var raw := ""
	if OS.has_feature("web"):
		var result: Variant = JavaScriptBridge.eval("(function(){try{return localStorage.getItem('%s')||'';}catch(e){return '__BLOCKED__';}})()" % web_key)
		if result == "__BLOCKED__":
			last_error = "Browser storage is blocked. This case cannot be saved between visits."
			return
		if result is String:
			raw = result
	elif FileAccess.file_exists(path):
		var file := FileAccess.open(path,FileAccess.READ)
		if file == null:
			last_error = "Could not read the saved case. It has not been overwritten."
			damaged_save = true
			return
		raw = file.get_as_text()
		file.close()
	if raw.is_empty():
		return
	restore_json(raw)

func restore_json(raw: String) -> void:
	var parser := JSON.new()
	if parser.parse(raw) != OK or not parser.data is Dictionary:
		mark_damaged()
		return
	var data: Dictionary = parser.data
	if data.get("version") != 1 or not data.get("earned") is Array or not data.get("placed") is Dictionary:
		mark_damaged()
		return
	var restored: Array[String] = []
	for id in data.earned:
		if not id is String or id not in IDS:
			mark_damaged()
			return
		if id not in restored:
			restored.append(id)
	var positions: Dictionary = {}
	for id in data.placed:
		var value: Variant = data.placed[id]
		if id not in restored or not value is Dictionary:
			mark_damaged()
			return
		for field in ["x","y","angle"]:
			if not value.get(field) is float and not value.get(field) is int:
				mark_damaged()
				return
			if not is_finite(float(value[field])):
				mark_damaged()
				return
		if value.x < 0 or value.x > 1 or value.y < 0 or value.y > 1 or absf(value.angle) > 0.45:
			mark_damaged()
			return
		positions[id] = value.duplicate()
	earned = restored
	placed = positions
	damaged_save = false
	last_error = ""

func start_browser_bridge() -> void:
	if not OS.has_feature("web"):
		return
	browser_callback = JavaScriptBridge.create_callback(browser_context)
	JavaScriptBridge.get_interface("window").__qilinCassetteContext = browser_callback
	JavaScriptBridge.eval("""
	(function(){
	  if(window.__qilinCassetteListener) return;
	  window.__qilinCassetteListener=function(e){
	    if(e.source!==window.parent || e.origin!==location.origin) return;
	    if(e.data?.type==='qilin-cassette-read') window.__qilinCassetteContext(JSON.stringify({read:true}));
	    if(e.data?.type==='qilin-cassette-context') window.__qilinCassetteContext(JSON.stringify(e.data));
	  };
	  window.addEventListener('message',window.__qilinCassetteListener);
	})();
	""")
	emit_browser_state(not damaged_save and last_error.is_empty())

func browser_context(arguments: Array) -> void:
	if arguments.is_empty() or not arguments[0] is String:
		return
	var payload: Variant = JSON.parse_string(arguments[0])
	if not payload is Dictionary:
		return
	if payload.get("read",false):
		emit_browser_state(not damaged_save and last_error.is_empty())
		return
	var next_key: Variant = payload.get("key")
	if not next_key is String:
		return
	var pattern := RegEx.new()
	pattern.compile("^qilin-keeper\\.keepsakes\\.account\\.usr_[A-Za-z0-9_-]{32}\\.v1$")
	if next_key != WEB_KEY and pattern.search(next_key) == null:
		return
	restore_json(JSON.stringify(payload.get("cassette")))
	if damaged_save:
		return
	web_key = next_key
	storage_writable = payload.get("writable", true) == true
	context_replaced.emit()
	save_case()

func emit_browser_state(persisted: bool) -> void:
	if not OS.has_feature("web"):
		return
	var message := {"type":"qilin-cassette-state","key":web_key,"cassette":{"version":1,"earned":earned,"placed":placed},"persisted":persisted,"damaged":damaged_save}
	JavaScriptBridge.eval("window.parent.postMessage(%s,location.origin)" % JSON.stringify(message))

func mark_damaged() -> void:
	damaged_save = true
	last_error = "Saved case could not be restored. The original save has been left untouched."

func save_case() -> bool:
	if damaged_save:
		return false
	if not storage_writable:
		last_error = "Original cassette left untouched. Import a backup in the save panel to recover it."
		emit_browser_state(false)
		return false
	var raw := JSON.stringify({"version":1,"earned":earned,"placed":placed},"",true,true)
	if OS.has_feature("web"):
		var result: Variant = JavaScriptBridge.eval("(function(){try{localStorage.setItem('%s',%s);return 'saved';}catch(e){return 'blocked';}})()" % [web_key,JSON.stringify(raw)])
		if result != "saved":
			last_error = "Browser storage blocked the save. Stickers remain only until this page closes."
			emit_browser_state(false)
			return false
	else:
		var temporary := path+".tmp"
		var file := FileAccess.open(temporary,FileAccess.WRITE)
		if file == null:
			last_error = "Could not save the case on this computer."
			return false
		file.store_string(raw)
		file.flush()
		var write_error := file.get_error()
		file.close()
		if write_error != OK:
			last_error = "Could not finish saving the case. Your previous save is unchanged."
			return false
		var result := DirAccess.rename_absolute(ProjectSettings.globalize_path(temporary),ProjectSettings.globalize_path(path))
		if result != OK:
			last_error = "Could not replace the case save. Your previous save is unchanged."
			return false
	last_error = ""
	emit_browser_state(true)
	return true
