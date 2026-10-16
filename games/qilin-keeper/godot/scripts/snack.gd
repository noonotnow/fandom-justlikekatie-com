extends Node2D
## A moonpear bite moving from the bowl to the baby's mouth.

func _draw() -> void:
	draw_circle(Vector2.ZERO, 22, Color("#352044"))
	draw_circle(Vector2(0,-2), 18, Color("#fff2aa"))
	draw_circle(Vector2(-6,-9), 5, Color("#fffbd8"))
	draw_line(Vector2(1,-16),Vector2(5,-28),Color("#594237"),4,true)
	draw_line(Vector2(6,-24),Vector2(18,-28),Color("#72d6a8"),6,true)
