extends Node2D
## The moon-marked cup is always the favorite. Water is not a care meter.

const HOME := Vector2(300,630)
const NEAR := Vector2(460,650)
const INK := Color("#352044")
var water := 3
var completed := false
var spilled := false
var sip_phase := 0.0
var hover := false

func contains(at: Vector2) -> bool:
	return to_local(at).distance_to(Vector2(0,-9)) < 52

func refill() -> void:
	water = 3
	completed = false
	spilled = false
	rotation = 0
	queue_redraw()

func spill() -> void:
	water = 0
	completed = false
	spilled = true
	rotation = -0.65
	queue_redraw()

func sip() -> void:
	water = maxi(0,water-1)
	queue_redraw()

func reset() -> void:
	position = HOME
	sip_phase = 0
	refill()

func oval(at: Vector2, radius: Vector2, color: Color) -> void:
	draw_set_transform(at,0,radius)
	draw_circle(Vector2.ZERO,1,color)
	draw_set_transform(Vector2.ZERO)

func _draw() -> void:
	if hover:
		draw_arc(Vector2(0,-5),51,0,TAU,48,Color("#fff1ba"),3,true)
	draw_arc(Vector2(35,-1),18,-PI/2,PI/2,24,INK,10,true)
	draw_arc(Vector2(35,-1),18,-PI/2,PI/2,24,Color("#87e6df"),5,true)
	draw_colored_polygon(PackedVector2Array([Vector2(-35,-26),Vector2(35,-26),Vector2(29,27),Vector2(-29,27)]),INK)
	draw_colored_polygon(PackedVector2Array([Vector2(-29,-22),Vector2(29,-22),Vector2(23,21),Vector2(-23,21)]),Color("#87e6df"))
	oval(Vector2(0,-25),Vector2(36,13),INK)
	oval(Vector2(0,-25),Vector2(29,8),Color("#467488"))
	if water > 0:
		oval(Vector2(0,-25),Vector2(18+water*2.3,3+water),Color("#acdffc"))
		draw_line(Vector2(-14,-26),Vector2(8,-26+sin(sip_phase)*2),Color("#effaff"),2,true)
	# A crescent makes the favorite identifiable without a score or demand.
	draw_circle(Vector2(-2,0),12,Color("#fff0b2"))
	draw_circle(Vector2(4,-4),10,Color("#87e6df"))
	if completed:
		draw_line(Vector2(-9,8),Vector2(-2,14),INK,3,true)
		draw_line(Vector2(-2,14),Vector2(10,1),INK,3,true)
