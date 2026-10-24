extends Node2D
## A physical prop, not a menu button. Its position determines swatting risk.

const OUTLINE := Color("#352044")
var full := true
var pieces := 3
var spilled := false
var tilt := 0.0
var hover := false
var spill_time := 0.0

func contains(point: Vector2) -> bool:
	return point.distance_to(global_position + Vector2(0, -12)) < 85.0

func refill() -> void:
	full = true
	pieces = 3
	spilled = false
	tilt = 0.0
	queue_redraw()

func spill() -> void:
	full = false
	pieces = 0
	spilled = true
	spill_time = 0.0
	queue_redraw()

func eat_one() -> void:
	pieces = maxi(0, pieces - 1)
	full = pieces > 0
	queue_redraw()

func _process(delta: float) -> void:
	if spilled:
		spill_time += delta
		tilt = lerpf(tilt, -0.78, minf(delta * 8.0, 1.0))
	queue_redraw()

func oval(at: Vector2, radius: Vector2, color: Color) -> void:
	draw_set_transform(at, 0.0, radius)
	draw_circle(Vector2.ZERO, 1.0, color)
	draw_set_transform(Vector2.ZERO)

func _draw() -> void:
	oval(Vector2(0, 24), Vector2(91, 18), Color(0.16, 0.08, 0.24, 0.22))
	if hover:
		draw_arc(Vector2(0, 4), 86, 0, TAU, 60, Color("#fff1ba"), 3, true)
	draw_set_transform(Vector2(0, 0), tilt)
	var shape := PackedVector2Array([Vector2(-76,-18),Vector2(76,-18),Vector2(63,28),Vector2(42,43),Vector2(-42,43),Vector2(-63,28)])
	draw_colored_polygon(shape, OUTLINE)
	var inner := PackedVector2Array([Vector2(-69,-15),Vector2(69,-15),Vector2(56,24),Vector2(37,36),Vector2(-37,36),Vector2(-56,24)])
	draw_colored_polygon(inner, Color("#b99bef"))
	draw_line(Vector2(-48, 22), Vector2(36, 29), Color("#f6d0f5"), 5, true)
	draw_set_transform(Vector2(0, -16), tilt, Vector2(76, 24))
	draw_circle(Vector2.ZERO, 1.0, OUTLINE)
	draw_set_transform(Vector2(0, -16), tilt, Vector2(69, 18))
	draw_circle(Vector2.ZERO, 1.0, Color("#725497"))
	draw_set_transform(Vector2.ZERO, tilt)
	if full:
		var positions := [Vector2(-35,-16), Vector2(2,-10), Vector2(34,-17)]
		for i in pieces:
			var at: Vector2 = positions[i]
			draw_circle(at, 20, OUTLINE)
			draw_circle(at + Vector2(0,-2), 17, Color("#fff2aa"))
			draw_circle(at + Vector2(-5,-7), 5, Color("#fffbd8"))
			draw_line(at + Vector2(1,-14), at + Vector2(5,-25), Color("#594237"), 4, true)
			draw_line(at + Vector2(6,-22), at + Vector2(18,-26), Color("#72d6a8"), 6, true)
	draw_set_transform(Vector2.ZERO)
