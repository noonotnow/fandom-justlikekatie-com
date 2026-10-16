extends Node2D
## A collapsible physical decoration activity, not a music player.

const Store = preload("res://scripts/keepsake_store.gd")
const CASE_ART = preload("res://assets/cassette-case.svg")
const ART := {
	"first_flight":preload("res://assets/sticker-first-flight.svg"),
	"first_landing":preload("res://assets/sticker-first-landing.svg")
}
const PANEL := Rect2(90,105,1100,670)
const CASE_RECT := Rect2(325,225,830,522.9)
const LABEL_RECT := Rect2(419,279,662,208)
# Keep full-size, rotated decorations above the cassette's central openings.
# LABEL_RECT remains the saved-coordinate frame; old keepsakes are not erased.
const DROP_RECT := Rect2(487,330,526,7)
const CLOSE_RECT := Rect2(1135,123,38,38)
const SLOT_RECTS := [Rect2(136,255,150,136),Rect2(136,460,150,136)]
const STICKER_SIZE := 144.0

var host: Node2D
var save_path := "user://qilin-keepsakes.json"
var store: RefCounted
var opened := false
var selected := ""
var dragging := false
var moved := false
var pointer := Vector2.ZERO
var pickup_at := Vector2.ZERO
var offset := Vector2.ZERO
var ghost := Vector2.ZERO
var angle := 0.0
var feedback := "These remember outings, not perfect performance."
var frozen: Array[Dictionary] = []
var font: Font

func _ready() -> void:
	font = ThemeDB.fallback_font
	store = Store.new()
	store.path = save_path
	store.load_case()
	store.start_browser_bridge()
	hide()
	update_button()

func update_button() -> void:
	if host.case_button != null:
		host.case_button.text = "Case %d / K" % store.earned.size()
		if not store.last_error.is_empty():
			host.case_button.text = "Case ! / K"

func award(id: String) -> bool:
	if id not in Store.IDS or id in store.earned:
		return false
	store.earned.append(id)
	store.save_case()
	update_button()
	host.status = "First flight remembered. A square-shades sticker is in your case." if id == "first_flight" else "Back safely. A cloud-and-paw-prints sticker is in your case."
	if not store.last_error.is_empty():
		host.status = store.last_error
	queue_redraw()
	return true

func open_case() -> bool:
	if opened:
		return true
	if host.state in ["nap","toy"]:
		host.status = "Finish the nap or put the ball away before decorating."
		return false
	if host.state in ["feeding","drinking","cuddle"] or host.grooming.quiet_time > 0 or host.bathing.quiet_time > 0:
		host.status = "Let the bite, sips, or little huff finish, then open the case."
		return false
	host.cancel_cup()
	host.cleanup.cancel_interaction()
	host.grooming.cancel()
	host.bathing.cancel()
	host.dragging = false
	host.mouse_held = false
	host.cuddle_held = false
	host.flight.release_input()
	frozen.clear()
	for node in [host.bowl,host.cup,host.cleanup,host.baby_mess,host.grooming,host.bathing]:
		frozen.append({"node":node,"processing":node.is_processing()})
		node.set_process(false)
	opened = true
	selected = ""
	feedback = "Stickers snap to the upper label, leaving the tape openings clear."
	show()
	queue_redraw()
	return true

func close_case() -> void:
	if not opened:
		return
	opened = false
	selected = ""
	dragging = false
	for entry in frozen:
		entry.node.set_process(bool(entry.processing) and not host.paused and not host.flight.active)
	frozen.clear()
	host.flight.release_input()
	hide()
	update_button()
	host.queue_redraw()

func center(id: String) -> Vector2:
	var data: Dictionary = store.placed[id]
	var at := LABEL_RECT.position+Vector2(float(data.x),float(data.y))*LABEL_RECT.size
	return clamp_drop(at)

func clamp_drop(at: Vector2) -> Vector2:
	return Vector2(clampf(at.x,DROP_RECT.position.x,DROP_RECT.end.x),clampf(at.y,DROP_RECT.position.y,DROP_RECT.end.y))

func pick(id: String, at: Vector2, from_case: bool = false) -> void:
	if id not in store.earned:
		feedback = "Take a cloud ride first." if id == "first_flight" else "Land after taking off to remember the return."
		queue_redraw()
		return
	selected = id
	dragging = true
	moved = false
	pickup_at = at
	angle = float(store.placed[id].angle) if store.placed.has(id) else 0.0
	ghost = center(id) if from_case else at
	offset = at-ghost
	feedback = "Drag onto the label, or release and click to place. Q/E turns it."
	queue_redraw()

func place(at: Vector2) -> bool:
	if selected.is_empty() or not LABEL_RECT.has_point(at):
		feedback = "Use the cream label. Esc cancels the pickup."
		queue_redraw()
		return false
	var normalized := (clamp_drop(at)-LABEL_RECT.position)/LABEL_RECT.size
	store.placed[selected] = {"x":normalized.x,"y":normalized.y,"angle":angle}
	var saved: bool = store.save_case()
	feedback = "Sticker placed. Saved on this browser." if OS.has_feature("web") else "Sticker placed. Saved on this computer."
	if not saved:
		feedback = store.last_error
	selected = ""
	dragging = false
	update_button()
	queue_redraw()
	return true

func return_to_tray() -> void:
	if selected.is_empty():
		return
	store.placed.erase(selected)
	store.save_case()
	selected = ""
	dragging = false
	feedback = "Back in the tray. The keepsake is still yours."
	if not store.last_error.is_empty():
		feedback = store.last_error
	update_button()
	queue_redraw()

func handle_at(event: InputEvent, at: Vector2) -> void:
	if not opened:
		return
	# Godot may emit both a real pointer event and an emulated counterpart.
	# One tap must not place a sticker and immediately pick it up again.
	if event.device < 0 and (event is InputEventMouseButton or event is InputEventMouseMotion or event is InputEventScreenTouch or event is InputEventScreenDrag):
		return
	if (event is InputEventScreenTouch or event is InputEventScreenDrag) and event.index != 0:
		return
	if event is InputEventKey and event.pressed:
		if event.keycode == KEY_K and not event.echo:
			close_case()
			return
		if event.keycode == KEY_ESCAPE and not event.echo:
			if selected.is_empty():
				close_case()
			else:
				selected = ""
				dragging = false
				feedback = "Pickup cancelled. Your decoration is unchanged."
			queue_redraw()
			return
		if not selected.is_empty():
			match event.keycode:
				KEY_Q: angle = clampf(angle-0.12,-0.45,0.45)
				KEY_E: angle = clampf(angle+0.12,-0.45,0.45)
				KEY_LEFT: ghost.x -= 12
				KEY_RIGHT: ghost.x += 12
				KEY_UP: ghost.y -= 12
				KEY_DOWN: ghost.y += 12
				KEY_ENTER,KEY_SPACE: place(clamp_drop(ghost))
				KEY_DELETE,KEY_BACKSPACE: return_to_tray()
		elif event.keycode in [KEY_1,KEY_2]:
			var id: String = Store.IDS[0 if event.keycode == KEY_1 else 1]
			pick(id,Vector2(650 if id == "first_flight" else 860,380))
			dragging = false
		queue_redraw()
		return
	var press := false
	var release := false
	var motion := false
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		press = event.pressed
		release = not event.pressed
	elif event is InputEventScreenTouch and event.index == 0:
		press = event.pressed
		release = not event.pressed
	elif event is InputEventMouseMotion or event is InputEventScreenDrag:
		motion = true
	pointer = at
	if motion and not selected.is_empty():
		ghost = at-offset
		if LABEL_RECT.has_point(ghost):
			ghost = clamp_drop(ghost)
		moved = moved or at.distance_to(pickup_at) > 4
	if press:
		if CLOSE_RECT.has_point(at):
			close_case()
			return
		for i in Store.IDS.size():
			if SLOT_RECTS[i].has_point(at):
				pick(Store.IDS[i],at)
				return
		if not selected.is_empty():
			place(at-offset)
			return
		var ids := Store.IDS.duplicate()
		ids.reverse()
		for id in ids:
			if store.placed.has(id) and at.distance_to(center(id)) < STICKER_SIZE*0.7:
				pick(id,at,true)
				return
	if release and not selected.is_empty():
		dragging = false
		if moved:
			if LABEL_RECT.has_point(ghost):
				place(ghost)
			else:
				selected = ""
				feedback = "Outside the label. Sticker returned to its previous spot or tray."
	queue_redraw()

func box(at: Rect2, fill: Color, radius: int = 16) -> void:
	var style := StyleBoxFlat.new()
	style.bg_color = fill
	style.border_color = Color("#2a1250")
	style.set_border_width_all(4)
	style.set_corner_radius_all(radius)
	draw_style_box(style,at)

func text(value: String, at: Vector2, size: int = 18, color: Color = Color("#39214f")) -> void:
	draw_string(font,at,value,HORIZONTAL_ALIGNMENT_LEFT,-1,size,color)

func sticker(id: String, at: Vector2, turn: float = 0.0, tint: Color = Color.WHITE) -> void:
	draw_set_transform(at,turn)
	draw_texture_rect(ART[id],Rect2(Vector2.ONE*(-STICKER_SIZE/2),Vector2.ONE*STICKER_SIZE),false,tint)
	draw_set_transform(Vector2.ZERO)

func _draw() -> void:
	if not opened:
		return
	draw_rect(Rect2(0,0,1280,800),Color(0.10,0.04,0.20,0.64))
	box(PANEL,Color("#fff0d3"),24)
	text("YOUR FIRST-AFTERNOON MIXTAPE",Vector2(127,154),30)
	text("The scene rests while you decorate. These are memories, not marks.",Vector2(128,184),18)
	text("Pick or drag. Q/E: turn. 1/2: select. Arrows: move. Enter: place. Del: return. K: close.",Vector2(128,211),16)
	box(CLOSE_RECT,Color("#8fe6d5"),10)
	text("X",CLOSE_RECT.position+Vector2(11,26),21)
	draw_texture_rect(CASE_ART,CASE_RECT,false)
	text("QILIN MIX / SIDE A",Vector2(429,578),22)
	text("C-90",Vector2(1010,578),22)
	for i in Store.IDS.size():
		var id: String = Store.IDS[i]
		var earned: bool = id in store.earned
		text("FIRST FLIGHT" if i == 0 else "FIRST LANDING",Vector2(136,SLOT_RECTS[i].position.y-12),18)
		box(SLOT_RECTS[i],Color("#b5eee0") if earned else Color("#ddcfe5"))
		sticker(id,SLOT_RECTS[i].get_center(),0,Color(1,1,1,1 if earned else 0.28))
		var caption := "On the case / pick again" if store.placed.has(id) else "Pick me up" if earned else "Take a cloud ride" if i == 0 else "Land after takeoff"
		text(caption,Vector2(130,SLOT_RECTS[i].end.y+23),15)
	for id in Store.IDS:
		if store.placed.has(id) and id != selected:
			sticker(id,center(id),float(store.placed[id].angle))
	if not selected.is_empty():
		draw_circle(ghost+Vector2(5,7),STICKER_SIZE*0.5,Color(0.12,0.04,0.25,0.15))
		sticker(selected,ghost,angle)
	var note: String = store.last_error if not store.last_error.is_empty() else feedback
	text(note,Vector2(128,760),16,Color("#82394e") if not store.last_error.is_empty() else Color("#5c3a6a"))
