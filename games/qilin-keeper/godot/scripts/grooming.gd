extends Node2D
## Routine grooming is not sticky-residue cleanup. Finished grooming is affection.

const TRAY := Vector2(1135,420)
const INK := Color("#352044")
const DIRECTION := Vector2(0.45,-0.89)
var body: Sprite2D
var surfaces: RefCounted
var selected := false
var scrubbing := false
var pointer := Vector2.ZERO
var tufts: Array[Dictionary] = []
var feedback := ""
var content := 0.0
var offended := 0.0
var quiet_time := 0.0
var huff_requested := false
var huff_cooldown := 0.0
var cursor: BrushTip
var tray_box: StyleBoxFlat
var areas := {
	"mane": PackedVector2Array([Vector2(247,302),Vector2(260,243),Vector2(294,211),
		Vector2(355,180),Vector2(399,163),Vector2(390,217),Vector2(362,258),
		Vector2(334,302),Vector2(279,350),Vector2(249,367)]),
	"tail": PackedVector2Array([Vector2(777,317),Vector2(789,251),Vector2(828,199),
		Vector2(875,162),Vector2(885,222),Vector2(873,284),Vector2(845,326),
		Vector2(812,352),Vector2(789,338)])
}

class BrushTip extends Node2D:
	var on_fur := false
	var guidance := true
	func _draw() -> void:
		if guidance:
			draw_arc(Vector2(0,-8),32,0,TAU,32,
				Color("#9fffe2") if on_fur else Color("#d9c4ee"),2,true)
		draw_line(Vector2(10,0),Vector2(43,37),Color("#352044"),12,true)
		draw_line(Vector2(10,0),Vector2(43,37),Color("#ffe09c"),7,true)
		draw_set_transform(Vector2(0,-8),-0.35,Vector2(27,18))
		draw_circle(Vector2.ZERO,1,Color("#352044"))
		draw_circle(Vector2.ZERO,0.84,Color("#ed87cf"))
		draw_circle(Vector2.ZERO,0.63,Color("#75e4cf"))
		draw_set_transform(Vector2.ZERO)
		for x in [-13,0,13]:
			for y in [-13,-4]:
				draw_circle(Vector2(x,y),2.2,Color("#44325f"))

func _ready() -> void:
	cursor = BrushTip.new()
	cursor.z_index = 20
	add_child(cursor)
	tray_box = tray_style()
	reset()

func reset() -> void:
	cancel()
	tufts.clear()
	for pixel in [Vector2(280,280),Vector2(330,240),Vector2(374,209)]:
		tufts.append({"local":pixel-Vector2(512,512),"part":"mane","ruffle":1.0})
	for pixel in [Vector2(806,310),Vector2(836,266),Vector2(861,224)]:
		tufts.append({"local":pixel-Vector2(512,512),"part":"tail","ruffle":1.0})
	content = 0
	offended = 0
	huff_requested = false
	huff_cooldown = 0
	feedback = ""
	queue_redraw()

func cancel() -> void:
	selected = false
	scrubbing = false
	quiet_time = 0
	if is_instance_valid(cursor):
		cursor.visible = false
	queue_redraw()

func groomed() -> bool:
	if tufts.is_empty():
		return false
	for tuft in tufts:
		if float(tuft.ruffle) > 0:
			return false
	return true

func part_done(part: String) -> bool:
	for tuft in tufts:
		if tuft.part == part and float(tuft.ruffle) > 0:
			return false
	return true

func part_at(at: Vector2) -> String:
	if not surfaces.sprite_covers(body,at):
		return ""
	var pixel := body.to_local(at)+Vector2(512,512)
	for part in areas:
		if Geometry2D.is_point_in_polygon(pixel,areas[part]):
			return part
	return ""

func area_contact(from: Vector2, to: Vector2, part: String) -> float:
	var steps := maxi(1,int(ceil(from.distance_to(to)/8.0)))
	var distance := 0.0
	for i in steps:
		var a := from.lerp(to,float(i)/steps)
		var b := from.lerp(to,float(i+1)/steps)
		if part_at((a+b)*0.5) == part and surfaces.sprite_covers(body,a) and surfaces.sprite_covers(body,b):
			distance += a.distance_to(b)
	return minf(distance,60.0)

func point(index: int) -> Vector2:
	return body.to_global(tufts[index].local)

func tray_contains(at: Vector2) -> bool:
	return at.distance_to(TRAY) < 48

func equip() -> void:
	if selected:
		cancel()
		feedback = "Brush back in its tray. Grooming stays done."
		return
	selected = true
	scrubbing = false
	pointer = TRAY
	feedback = "Brush in hand. Move it across the mane and tail; no held click needed."
	queue_redraw()

func hint() -> String:
	if groomed():
		return "Mane and tail smooth. Extra brushing is affection. ESC returns brush."
	var needed := "Tail still fluffy." if part_done("mane") else ("Mane still fluffy." if part_done("tail") else "Mane + tail.")
	return "Move the carried brush up-right across the fur—no held click. "+needed+" ESC returns brush."

func request_huff() -> void:
	if huff_cooldown <= 0:
		huff_requested = true
		huff_cooldown = 4

func stroke(from: Vector2, to: Vector2) -> void:
	if not selected or from.distance_to(to) < 1:
		return
	var direction := (body.to_global(DIRECTION)-body.to_global(Vector2.ZERO)).normalized()
	var alignment := (to-from).normalized().dot(direction)
	var touched := false
	var unfinished_touched := false
	var finished_before := groomed()
	for part in areas:
		var contact := area_contact(from,to,part)
		if contact <= 0:
			continue
		touched = true
		if part_done(part):
			continue
		unfinished_touched = true
		for i in tufts.size():
			if tufts[i].part != part:
				continue
			if alignment > 0.2:
				tufts[i].ruffle = maxf(0,float(tufts[i].ruffle)-contact/90.0)
			elif alignment < -0.35:
				# A small fluff-back, not the near-total undo of a return stroke.
				tufts[i].ruffle = minf(1,float(tufts[i].ruffle)+contact/480.0)
	if not touched:
		feedback = "Brush the mane or tail. Sticky paws still need the CLOTH / W."
		return
	if finished_before or groomed():
		content = 1.0
		offended = 0
		quiet_time = 5.0
		request_huff()
		feedback = "" if finished_before else "Mane and tail smooth. Now it's just affection."
	elif alignment > 0.2 or not unfinished_touched:
		content = 1.0
		offended = 0
		feedback = "Mane smooth. Tail still fluffy." if part_done("mane") else ("Tail smooth. Mane still fluffy." if part_done("tail") else "There we go. The fur is settling.")
	elif alignment < -0.35:
		content = 0
		offended = 0.6
		feedback = "Excuse you. Toward the tuft tips, please."
	else:
		feedback = "Follow the fur toward the tips: up and right."
	queue_redraw()

func handle(event: InputEvent) -> bool:
	return handle_at(event,get_global_mouse_position())

func handle_at(event: InputEvent, at: Vector2) -> bool:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed and tray_contains(at):
			get_parent().equip_brush()
			pointer = at
			scrubbing = selected
			return true
		if not selected:
			return false
		pointer = at
		scrubbing = event.pressed
		return true
	if event is InputEventMouseMotion and selected:
		var before := pointer
		pointer = at
		stroke(before,at)
		return true
	return false

func _process(delta: float) -> void:
	content = move_toward(content,0,delta)
	offended = move_toward(offended,0,delta)
	quiet_time = move_toward(quiet_time,0,delta)
	huff_cooldown = move_toward(huff_cooldown,0,delta)
	cursor.visible = selected
	cursor.position = pointer
	cursor.on_fur = not part_at(pointer).is_empty()
	cursor.guidance = not groomed()
	cursor.queue_redraw()
	queue_redraw()

func draw_tuft(tuft: Dictionary) -> void:
	var at: Vector2 = tuft.local
	var amount: float = tuft.ruffle
	if amount <= 0:
		return
	var along := DIRECTION
	var across := Vector2(-along.y,along.x)
	var tip := at + along*(12+42*amount) + across*amount*12
	var outline := PackedVector2Array([
		at-across*12-along*9,tip-across*7,
		tip+along*8,at+across*13-along*5])
	draw_colored_polygon(outline,INK)
	draw_colored_polygon(PackedVector2Array([
		at-across*8-along*4,tip-across*3,
		tip+along*3,at+across*8-along*1]),Color("#7550c9"))
	draw_line(at-along*1,tip-across*2,Color("#70dfdf"),3,true)

func _draw() -> void:
	# Tufts inherit the illustrated creature's live breathing/lean transform.
	if is_instance_valid(body):
		draw_set_transform(body.position,body.rotation,body.scale)
		if selected and not groomed() and content <= 0 and offended <= 0:
			for part in areas:
				if part_done(part):
					continue
				var outline := PackedVector2Array()
				for pixel in areas[part]:
					outline.append(pixel-Vector2(512,512))
				outline.append(outline[0])
				draw_polyline(outline,Color(1,0.95,0.74,0.6),2.5,true)
		for tuft in tufts:
			draw_tuft(tuft)
		draw_set_transform(Vector2.ZERO)
	draw_style_box(tray_box,Rect2(TRAY-Vector2(45,35),Vector2(90,70)))
	if not selected:
		draw_set_transform(TRAY+Vector2(-8,2),0,Vector2.ONE*0.72)
		draw_brush_prop()
		draw_set_transform(Vector2.ZERO)
	draw_string(ThemeDB.fallback_font,TRAY+Vector2(-35,49),"BRUSH / T",HORIZONTAL_ALIGNMENT_LEFT,-1,14,INK)

func tray_style() -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = Color("#fff0ca")
	box.border_color = INK
	box.set_border_width_all(4)
	box.set_corner_radius_all(12)
	return box

func draw_brush_prop() -> void:
	draw_line(Vector2(10,0),Vector2(43,37),INK,12,true)
	draw_line(Vector2(10,0),Vector2(43,37),Color("#ffe09c"),7,true)
	draw_set_transform(TRAY+Vector2(-8,-4),-0.35,Vector2(20,13))
	draw_circle(Vector2.ZERO,1,INK)
	draw_circle(Vector2.ZERO,0.82,Color("#ed87cf"))
	draw_circle(Vector2.ZERO,0.6,Color("#75e4cf"))
	draw_set_transform(Vector2.ZERO)
	for x in [-9,0,9]:
		draw_circle(TRAY+Vector2(x-8,-5),1.8,INK)
