extends Node2D
## Accident cleanup, separate from routine grooming. No scores or care meters.

const BIN := Vector2(150, 642)
const CLOTH_HOME := Vector2(1155, 635)
const MOP_HOME := Vector2(1135, 535)
const INK := Color("#352044")
var foods: Array[Vector2] = []
var patches: Array[Dictionary] = []
var held := -1
var cloth_selected := false
var mop_selected := false
var baby_mess: Node2D
var surfaces: RefCounted
var scrubbing := false
var pointer := Vector2.ZERO
var gathered := 0
var feedback := ""
var completed := false
var flight := 0.0
var flight_start := Vector2.ZERO
var cursor: ToolCursor
var mop_prop: ToolCursor

class ToolCursor extends Node2D:
	var kind := ""
	var blocked := false
	func _draw() -> void:
		if kind == "food":
			draw_circle(Vector2.ZERO, 18, Color("#352044"))
			draw_circle(Vector2(0,-2), 14, Color("#fff2aa"))
			draw_line(Vector2(-5,1), Vector2(7,-6), Color("#efaa74"), 3, true)
		elif kind == "cloth":
			var outline := PackedVector2Array([Vector2(-30,-18),Vector2(22,-22),Vector2(32,13),Vector2(-19,23)])
			draw_colored_polygon(outline, Color("#352044"))
			draw_colored_polygon(PackedVector2Array([Vector2(-24,-14),Vector2(18,-16),Vector2(25,10),Vector2(-15,16)]), Color("#71dfcb"))
			draw_line(Vector2(-12,-13), Vector2(-3,16), Color("#ffe699"), 5, true)
			draw_line(Vector2(8,-15), Vector2(16,12), Color("#ffe699"), 4, true)
		elif kind == "mop":
			draw_line(Vector2(0,-8),Vector2(42,-68),Color("#352044"),11,true)
			draw_line(Vector2(0,-8),Vector2(42,-68),Color("#ffdfa5"),6,true)
			draw_colored_polygon(PackedVector2Array([Vector2(-32,-8),Vector2(30,-8),Vector2(34,22),Vector2(-34,22)]),Color("#352044"))
			draw_rect(Rect2(-28,-4,56,10),Color("#df75c7"))
			for x in range(-24,25,8):
				draw_line(Vector2(x,6),Vector2(x-3,18),Color("#a3f0dc"),6,true)
			if blocked:
				draw_line(Vector2(-10,-5),Vector2(10,16),Color("#ff77c2"),5,true)
				draw_line(Vector2(10,-5),Vector2(-10,16),Color("#ff77c2"),5,true)

func _ready() -> void:
	cursor = ToolCursor.new()
	cursor.z_index = 20
	add_child(cursor)
	mop_prop = ToolCursor.new()
	mop_prop.kind = "mop"
	mop_prop.position = MOP_HOME+Vector2(-6,12)
	mop_prop.scale = Vector2.ONE * 0.65
	add_child(mop_prop)
	queue_redraw()

func has_mess() -> bool:
	return has_floor_mess() or has_baby_mess()

func has_floor_mess() -> bool:
	return not foods.is_empty() or not patches.is_empty()

func has_baby_mess() -> bool:
	return is_instance_valid(baby_mess) and baby_mess.has_mess()

func active() -> bool:
	return held >= 0 or cloth_selected or mop_selected or flight > 0

func hint() -> String:
	if cloth_selected:
		return "Cloth: rub the sticky paw and muzzle. Floor needs the mop. ESC returns tool."
	if mop_selected:
		return "Mop: hold-drag over floor patches (water or moonpear). ESC returns tool."
	if not foods.is_empty():
		return "COMPOST / G: fallen bites. CLOTH / W: baby. MOP / V: floor after gathering."
	if has_floor_mess() and has_baby_mess():
		return "CLOTH / W: sticky paw and muzzle. MOP / V: sticky floor. Separate jobs."
	if has_floor_mess():
		return "MOP / V: hold-drag over the remaining floor patches. Water needs no compost."
	if has_baby_mess():
		return "Floor clean. CLOTH / W: hold-drag over the sticky paw and muzzle."
	return "Bowl / F: feed. CUP / J: drink. U: move cup. Hold cheek: affection. W: cloth. V: mop."

func floor_point(at: Vector2, radius := Vector2(24,24)) -> Vector2:
	if is_instance_valid(surfaces):
		return surfaces.floor_point(at,radius)
	return Vector2(clampf(at.x,110,1170),clampf(at.y,555,675))

func spawn(at: Vector2) -> void:
	for offset in [Vector2(-120,0),Vector2(-58,23),Vector2(37,32)]:
		foods.append(floor_point(at+offset))
	for offset in [Vector2(-95,8),Vector2(-23,25),Vector2(62,8)]:
		patches.append({"at": floor_point(at+offset,Vector2(40,25)), "remaining": 1.0})
	completed = false
	if is_instance_valid(baby_mess):
		baby_mess.mark_dirty()
	feedback = "Moonpear everywhere. Cloth for baby; compost and mop for floor."
	queue_redraw()

func spawn_water(at: Vector2) -> void:
	# Water never creates fallen food or sticky baby residue.
	for offset in [Vector2(-45,8),Vector2(35,20)]:
		patches.append({"at":floor_point(at+offset,Vector2(40,25)), "remaining":1.0, "water":true})
	completed = false
	feedback = "Just water on the floor. MOP / V; no compost or cloth needed."
	if not foods.is_empty():
		feedback = "Water and moonpear on the floor. COMPOST / G for bites; MOP / V for floor."
	elif has_baby_mess():
		feedback = "Water: MOP / V. Existing sticky baby residue still needs CLOTH / W."
	queue_redraw()

func equip_cloth() -> void:
	if not has_baby_mess():
		feedback = "Paw and muzzle are clean. Floor residue needs the MOP / V."
		return
	var was_selected := cloth_selected
	cancel_interaction()
	cloth_selected = not was_selected
	pointer = CLOTH_HOME
	feedback = "Cloth ready. Gently rub the sticky paw and muzzle." if cloth_selected else "Cloth back in its tray."
	queue_redraw()

func equip_mop() -> void:
	if not foods.is_empty():
		feedback = "Gather the fallen bites into COMPOST / G before mopping."
		return
	if patches.is_empty():
		feedback = "Floor already clean. The CLOTH / W is for sticky paws and muzzle."
		return
	var was_selected := mop_selected
	cancel_interaction()
	mop_selected = not was_selected
	pointer = MOP_HOME
	feedback = "Mop ready. Hold-drag across the floor patches." if mop_selected else "Mop back in its tray."
	queue_redraw()

func collect_one() -> void:
	if foods.is_empty() or held >= 0 or flight > 0:
		return
	held = 0
	flight = 0.35
	flight_start = foods[0]
	pointer = flight_start

func cancel_interaction() -> void:
	held = -1
	flight = 0.0
	cloth_selected = false
	mop_selected = false
	scrubbing = false
	if is_instance_valid(cursor):
		cursor.kind = ""
		cursor.queue_redraw()
	queue_redraw()

func reset() -> void:
	cancel_interaction()
	foods.clear()
	patches.clear()
	if is_instance_valid(baby_mess):
		baby_mess.reset()
	gathered = 0
	feedback = ""
	completed = false
	queue_redraw()

func deposit() -> void:
	if held < 0:
		return
	foods.remove_at(held)
	held = -1
	gathered += 1
	feedback = "Scraps collected. MOP / V for floor; CLOTH / W for baby." if foods.is_empty() else "Into the compost. Gather the other fallen bites."
	queue_redraw()

func wipe(from: Vector2, to: Vector2) -> void:
	if not scrubbing:
		return
	if cloth_selected:
		if is_instance_valid(baby_mess):
			baby_mess.wipe(from,to)
		if not has_baby_mess():
			finish_tool()
		return
	if not mop_selected or not foods.is_empty():
		return
	if is_instance_valid(surfaces) and surfaces.hits_baby(to):
		feedback = "That's the baby, not the floor. Use CLOTH / W."
		return
	var distance := minf(from.distance_to(to),40)
	if distance < 1:
		return
	for i in range(patches.size()-1,-1,-1):
		var at: Vector2 = patches[i].at
		var contact: float = surfaces.contact_distance(from,to,at,32.0,false) if is_instance_valid(surfaces) else distance
		if contact > 0 and Geometry2D.get_closest_point_to_segment(at,from,to).distance_to(at) < 32:
			patches[i].remaining -= contact / 140.0
			if patches[i].remaining <= 0:
				patches.remove_at(i)
	if patches.is_empty():
		finish_tool()
	queue_redraw()

func finish_tool() -> void:
	cancel_interaction()
	completed = not has_mess()
	if completed:
		feedback = "Baby clean. Floor clean. Entirely innocent, apparently."
	elif has_floor_mess():
		feedback = "Baby clean. Floor still messy: COMPOST / G, then MOP / V."
	else:
		feedback = "Floor clean. CLOTH / W for the sticky paw and muzzle."

func handle(event: InputEvent) -> bool:
	return handle_at(event,get_global_mouse_position())

func handle_at(event: InputEvent, at: Vector2) -> bool:
	if flight > 0:
		return event is InputEventMouse
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if not event.pressed:
			if held >= 0:
				if at.distance_to(BIN) < 65:
					deposit()
				else:
					foods[held] = floor_point(at)
					held = -1
					feedback = "Drop the fallen bite into COMPOST on the left."
				queue_redraw()
				return true
			if cloth_selected or mop_selected:
				scrubbing = false
				return true
			return false
		for i in range(foods.size()-1,-1,-1):
			if not cloth_selected and not mop_selected and at.distance_to(foods[i]) < 26:
				held = i
				pointer = at
				return true
		if at.distance_to(CLOTH_HOME) < 42:
			equip_cloth()
			if cloth_selected:
				pointer = at
				scrubbing = true
			return true
		if at.distance_to(MOP_HOME) < 42:
			equip_mop()
			if mop_selected:
				pointer = at
				scrubbing = true
			return true
		if cloth_selected or mop_selected:
			pointer = at
			scrubbing = true
			return true
	if event is InputEventMouseMotion:
		if cloth_selected or mop_selected:
			wipe(pointer,at)
			pointer = at
			return true
		if held >= 0:
			pointer = at
			return true
	return false

func _process(delta: float) -> void:
	if flight > 0:
		flight = maxf(0,flight-delta)
		var t := 1.0-flight/0.35
		pointer = flight_start.lerp(BIN,t) + Vector2(0,-sin(t*PI)*35)
		if flight == 0:
			deposit()
	cursor.kind = "food" if held >= 0 else ("cloth" if cloth_selected else ("mop" if mop_selected else ""))
	cursor.blocked = mop_selected and is_instance_valid(surfaces) and surfaces.hits_baby(pointer)
	mop_prop.visible = not mop_selected
	cursor.position = pointer
	cursor.queue_redraw()
	queue_redraw()

func oval(at: Vector2, radius: Vector2, color: Color) -> void:
	draw_set_transform(at,0,radius)
	draw_circle(Vector2.ZERO,1,color)
	draw_set_transform(Vector2.ZERO)

func _draw() -> void:
	for patch in patches:
		var at: Vector2 = patch.at
		var left: float = patch.remaining
		if patch.get("water",false):
			oval(at,Vector2(31,15),Color(0.35,0.74,0.94,0.65*left))
			oval(at+Vector2(-15,-3),Vector2(13,3),Color(0.87,0.97,1,0.85*left))
			oval(at+Vector2(24,-8),Vector2(6,4),Color(0.35,0.74,0.94,0.8*left))
		else:
			oval(at,Vector2(31,15),Color(0.93,0.65,0.38,0.65*left))
			oval(at+Vector2(-20,7),Vector2(8,5),Color(1,0.87,0.47,0.8*left))
			oval(at+Vector2(24,-8),Vector2(6,4),Color(1,0.87,0.47,0.8*left))
	for i in foods.size():
		if i == held:
			continue
		var at := foods[i]
		draw_circle(at,18,INK)
		draw_circle(at+Vector2(0,-2),14,Color("#fff2aa"))
		draw_line(at+Vector2(-5,1),at+Vector2(7,-6),Color("#efaa74"),3,true)
	# Compost dish and cloth caddy are physical scene props, not menu actions.
	oval(BIN+Vector2(0,20),Vector2(61,14),Color(0.15,0.08,0.22,0.2))
	draw_colored_polygon(PackedVector2Array([BIN+Vector2(-54,-20),BIN+Vector2(54,-20),BIN+Vector2(40,28),BIN+Vector2(-40,28)]),INK)
	draw_colored_polygon(PackedVector2Array([BIN+Vector2(-46,-15),BIN+Vector2(46,-15),BIN+Vector2(34,21),BIN+Vector2(-34,21)]),Color("#76caac"))
	oval(BIN+Vector2(0,-17),Vector2(54,18),INK)
	oval(BIN+Vector2(0,-17),Vector2(46,12),Color("#4d8a78"))
	for i in mini(gathered,4):
		draw_circle(BIN+Vector2(-24+i*16,-18+(i%2)*6),8,Color("#f7dfa0"))
	draw_string(ThemeDB.fallback_font,BIN+Vector2(-41,49),"COMPOST",HORIZONTAL_ALIGNMENT_LEFT,-1,17,Color("#352044"))
	draw_style_box(tray_style(),Rect2(CLOTH_HOME-Vector2(43,32),Vector2(86,64)))
	if not cloth_selected:
		draw_colored_polygon(PackedVector2Array([CLOTH_HOME+Vector2(-29,-16),CLOTH_HOME+Vector2(23,-20),CLOTH_HOME+Vector2(31,15),CLOTH_HOME+Vector2(-20,23)]),INK)
		draw_colored_polygon(PackedVector2Array([CLOTH_HOME+Vector2(-24,-12),CLOTH_HOME+Vector2(19,-15),CLOTH_HOME+Vector2(25,11),CLOTH_HOME+Vector2(-17,17)]),Color("#71dfcb"))
		draw_line(CLOTH_HOME+Vector2(-11,-13),CLOTH_HOME+Vector2(-3,17),Color("#ffe699"),5,true)
		draw_line(CLOTH_HOME+Vector2(7,-14),CLOTH_HOME+Vector2(14,14),Color("#ffe699"),4,true)
	draw_string(ThemeDB.fallback_font,CLOTH_HOME+Vector2(-28,49),"CLOTH",HORIZONTAL_ALIGNMENT_LEFT,-1,17,INK)
	draw_style_box(tray_style(),Rect2(MOP_HOME-Vector2(43,32),Vector2(86,64)))
	draw_string(ThemeDB.fallback_font,MOP_HOME+Vector2(-21,49),"MOP",HORIZONTAL_ALIGNMENT_LEFT,-1,17,INK)

func tray_style() -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = Color("#ffdfa5")
	box.border_color = INK
	box.set_border_width_all(4)
	box.set_corner_radius_all(12)
	return box
