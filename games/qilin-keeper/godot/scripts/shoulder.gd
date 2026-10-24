extends Node2D
## Flexible sleeve underlay, behind the body and the illustrated moving paw.
## Its fixed end stays inside the coat; its other end follows the forearm.

var limb: Node2D

func _process(_delta: float) -> void:
	queue_redraw()

func _draw() -> void:
	if not is_instance_valid(limb):
		return
	var fixed := Vector2(292, 742) - Vector2(512, 512)
	var moving := limb.position + Vector2(242-292, 782-750).rotated(limb.rotation)
	draw_line(fixed, moving, Color("#20182e"), 82, true)
	draw_circle(fixed, 41, Color("#20182e"))
	draw_circle(moving, 41, Color("#20182e"))
	draw_line(fixed, moving, Color("#6241cc"), 68, true)
	draw_circle(fixed, 34, Color("#6241cc"))
	draw_circle(moving, 34, Color("#6241cc"))
