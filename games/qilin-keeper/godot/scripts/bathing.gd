extends Node2D
## Routine fur care only. Accident residue and the water-resistant jacket stay separate.

const HOMES := [Vector2(150,320),Vector2(150,420),Vector2(150,520)]
const LABELS := ["WASH / S","RINSE / E","DRY / D"]
const INK := Color("#352044")
var body: Sprite2D
var surfaces: RefCounted
var selected := -1
var scrubbing := false
var pointer := Vector2.ZERO
var patches: Array[Dictionary] = []
var feedback := ""
var content := 0.0
var startled := 0.0
var water_seen := false
var quiet_time := 0.0
var huff_requested := false
var cursor: BathProp
var props: Array[BathProp] = []

class BathProp extends Node2D:
	var kind := 0
	func _draw() -> void:
		var ink := Color("#352044")
		if kind == 0:
			draw_style_box(box(Color("#ffe09c")),Rect2(-28,-17,56,34))
			for at in [Vector2(-15,-6),Vector2(3,6),Vector2(17,-5)]:
				draw_circle(at,3,Color("#df9c73"))
			draw_circle(Vector2(-20,-20),7,Color("#edcef4"))
			draw_circle(Vector2(8,-21),9,Color("#b5f7ec"))
		elif kind == 1:
			draw_arc(Vector2(20,-2),16,-PI/2,PI/2,20,ink,7,true)
			draw_colored_polygon(PackedVector2Array([Vector2(-22,-22),Vector2(13,-22),Vector2(22,19),Vector2(-23,19)]),ink)
			draw_colored_polygon(PackedVector2Array([Vector2(-17,-17),Vector2(9,-17),Vector2(16,14),Vector2(-18,14)]),Color("#80dfed"))
			draw_line(Vector2(-20,-17),Vector2(-34,-25),ink,8,true)
			draw_line(Vector2(-15,2),Vector2(11,2),Color("#fff2ca"),4,true)
		else:
			draw_style_box(box(Color("#ed87cf")),Rect2(-31,-23,62,46))
			for x in [-17,0,17]:
				draw_line(Vector2(x,-19),Vector2(x,19),Color("#fff0ca"),5,true)
			for x in range(-24,25,8):
				draw_line(Vector2(x,22),Vector2(x,28),ink,3,true)
	func box(color: Color) -> StyleBoxFlat:
		var style := StyleBoxFlat.new()
		style.bg_color = color
		style.border_color = Color("#352044")
		style.set_border_width_all(4)
		style.set_corner_radius_all(8)
		return style

func _ready() -> void:
	for i in 3:
		var prop := BathProp.new()
		prop.kind = i
		prop.position = HOMES[i]
		prop.scale = Vector2.ONE * 0.8
		add_child(prop)
		props.append(prop)
	cursor = BathProp.new()
	cursor.z_index = 20
	add_child(cursor)
	reset()

func reset() -> void:
	cancel()
	patches.clear()
	for pixel in [Vector2(280,280),Vector2(330,240),Vector2(374,209),Vector2(806,310),Vector2(836,266),Vector2(861,224)]:
		patches.append({"local":pixel-Vector2(512,512),"wash":0.0,"rinse":0.0,"dry":0.0})
	water_seen = false
	startled = 0
	content = 0
	huff_requested = false
	feedback = ""
	queue_redraw()

func cancel() -> void:
	selected = -1
	scrubbing = false
	quiet_time = 0
	if is_instance_valid(cursor):
		cursor.visible = false
	queue_redraw()

func finished_stage(stage: String) -> bool:
	if patches.is_empty():
		return false
	for patch in patches:
		if float(patch[stage]) < 1:
			return false
	return true

func complete() -> bool:
	return finished_stage("dry")

func point(index: int) -> Vector2:
	return body.to_global(patches[index].local)

func tray_at(at: Vector2) -> int:
	for i in 3:
		if at.distance_to(HOMES[i]) < 42:
			return i
	return -1

func equip(kind: int) -> void:
	if selected == kind:
		cancel()
		feedback = "Bath tool returned. Fur care stays done."
		return
	selected = kind
	scrubbing = false
	pointer = HOMES[kind]
	feedback = hint()
	queue_redraw()

func hint() -> String:
	if complete():
		return "Fur washed, rinsed, and dry. More towel strokes are affection. ESC returns tool."
	match selected:
		0: return "Sponge: hold-drag on exposed mane + tail. Jacket sheds water; accidents need cloth."
		1: return "Pitcher: hold-drag over lathered mane + tail to rinse. Finish washing both first."
		2: return "Towel: hold-drag over damp mane + tail. Finish rinsing both first."
	return "WASH / S, RINSE / E, DRY / D: sponge, pitcher, towel. Exposed mane + tail only."

func stroke(from: Vector2, to: Vector2) -> void:
	if selected < 0 or not scrubbing or from.distance_to(to) < 1:
		return
	var touched := false
	for i in patches.size():
		var contact: float = surfaces.fur_contact_distance(from,to,point(i),23)
		if contact <= 0:
			continue
		touched = true
		if complete():
			if selected == 2:
				content = 1
				quiet_time = 5
				feedback = ""
			continue
		if selected == 0:
			if float(patches[i].wash) < 1:
				patches[i].wash = minf(1,float(patches[i].wash)+contact/100)
				if not water_seen:
					water_seen = true
					startled = 0.8
				feedback = "Oh! Warm water. Gentle lather on the mane and tail."
		elif selected == 1:
			if not finished_stage("wash"):
				feedback = "Lather all the exposed mane and tail with the sponge first."
				continue
			patches[i].rinse = minf(1,float(patches[i].rinse)+contact/100)
			feedback = "Lather rinsing away. The fur is damp now."
		else:
			if not finished_stage("rinse"):
				feedback = "Rinse the lather from both mane and tail before drying."
				continue
			patches[i].dry = minf(1,float(patches[i].dry)+contact/100)
			feedback = "Soft towel. Damp fur fluffing up."
	if not touched:
		feedback = "Exposed mane and tail only. Jacket sheds water; sticky paw/muzzle need CLOTH / W."
	elif complete() and quiet_time == 0:
		content = 1
		quiet_time = 5
		huff_requested = true
		feedback = "Washed, rinsed, and fluffy dry. Just affection now."
	elif selected == 0 and finished_stage("wash") and not complete():
		feedback = "Mane and tail lathered. Take the RINSE pitcher / E."
	elif selected == 1 and finished_stage("rinse") and not complete():
		feedback = "All lather rinsed away. Take the DRY towel / D."
	queue_redraw()

func handle_at(event: InputEvent, at: Vector2) -> bool:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		var tray := tray_at(at)
		if event.pressed and tray >= 0:
			get_parent().equip_bath(tray)
			pointer = at
			scrubbing = selected >= 0
			return true
		if selected < 0:
			return false
		pointer = at
		scrubbing = event.pressed
		return true
	if event is InputEventMouseMotion and selected >= 0:
		var before := pointer
		pointer = at
		stroke(before,at)
		return true
	return false

func _process(delta: float) -> void:
	content = move_toward(content,0,delta)
	startled = move_toward(startled,0,delta)
	quiet_time = move_toward(quiet_time,0,delta)
	cursor.visible = selected >= 0
	cursor.position = pointer
	cursor.kind = maxi(0,selected)
	cursor.queue_redraw()
	for i in 3:
		props[i].visible = selected != i
	queue_redraw()

func _draw() -> void:
	if is_instance_valid(body):
		draw_set_transform(body.position,body.rotation,body.scale)
		for patch in patches:
			var at: Vector2 = patch.local
			var foam: float = patch.wash*(1.0-patch.rinse)
			var damp: float = patch.rinse*(1.0-patch.dry)
			if damp > 0:
				for offset in [Vector2(-8,3),Vector2(8,-5)]:
					draw_line(at+offset,at+offset+Vector2(-4,15),Color(0.08,0.3,0.57,damp),7,true)
					draw_circle(at+offset+Vector2(-4,16),4,Color(0.4,0.88,1,damp))
			if foam > 0:
				for offset in [Vector2(-9,3),Vector2(7,-7),Vector2(8,10)]:
					draw_circle(at+offset,11,Color(0.55,0.96,0.9,foam))
					draw_arc(at+offset,8,PI,TAU,16,Color(1,0.95,1,foam),3,true)
			if float(patch.dry) > 0:
				draw_line(at+Vector2(-8,8),at+Vector2(8,-8),Color("#b5f7ec"),4,true)
		draw_set_transform(Vector2.ZERO)
	for i in 3:
		var box := StyleBoxFlat.new()
		box.bg_color = Color("#fff0ca")
		box.border_color = INK
		box.set_border_width_all(4)
		box.set_corner_radius_all(12)
		draw_style_box(box,Rect2(HOMES[i]-Vector2(45,34),Vector2(90,68)))
		draw_string(ThemeDB.fallback_font,HOMES[i]+Vector2(-39,51),LABELS[i],HORIZONTAL_ALIGNMENT_LEFT,-1,14,INK)
