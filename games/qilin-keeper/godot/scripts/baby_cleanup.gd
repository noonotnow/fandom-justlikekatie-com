extends Node2D
## Juice on the baby is independent from residue on the floor.

var body: Sprite2D
var paw: Node2D
var surfaces: RefCounted
var spots: Array[Dictionary] = []
var recent_contact := 0.0

func mark_dirty() -> void:
	spots = [{"part": "paw", "remaining": 1.0}, {"part": "muzzle", "remaining": 1.0}]
	queue_redraw()

func reset() -> void:
	spots.clear()
	recent_contact = 0.0
	queue_redraw()

func has_mess() -> bool:
	return not spots.is_empty()

func point(part: String) -> Vector2:
	return paw.palm_position() if part == "paw" else body.to_global(Vector2(-238,84))

func wipe(from: Vector2, to: Vector2) -> void:
	var distance := minf(from.distance_to(to),40.0)
	if distance < 1.0:
		return
	for i in range(spots.size()-1,-1,-1):
		var anchor := point(spots[i].part)
		var contact: float = surfaces.contact_distance(from,to,anchor,38.0,true) if is_instance_valid(surfaces) else distance
		if contact > 0 and Geometry2D.get_closest_point_to_segment(anchor,from,to).distance_to(anchor) < 38:
			recent_contact = 0.6
			spots[i].remaining -= contact / 140.0
			if spots[i].remaining <= 0:
				spots.remove_at(i)
	queue_redraw()

func _process(delta: float) -> void:
	recent_contact = maxf(0.0,recent_contact-delta)
	queue_redraw()

func _draw() -> void:
	for spot in spots:
		var at := to_local(point(spot.part))
		var alpha: float = spot.remaining
		for offset in [Vector2(-10,-1),Vector2(8,5),Vector2(3,-10)]:
			draw_circle(at+offset,7,Color(0.38,0.2,0.22,alpha))
			draw_circle(at+offset+Vector2(0,-1),5,Color(1.0,0.74,0.28,alpha))
