extends Node2D
## Foreground keeper hand. It offers affection rather than a score effect.

var amount := 0.0

func _process(_delta: float) -> void:
	queue_redraw()

func _draw() -> void:
	if amount < 0.01:
		return
	draw_set_transform(Vector2(-30*(1-amount),0),-0.12,Vector2.ONE*amount)
	var ink := Color("#4b2c56")
	var skin := Color("#f4bda8")
	var arm := PackedVector2Array([Vector2(-88,76),Vector2(-50,39),Vector2(-14,10),Vector2(20,10),Vector2(28,36),Vector2(-12,61),Vector2(-64,104)])
	draw_colored_polygon(arm,ink)
	draw_colored_polygon(PackedVector2Array([Vector2(-80,77),Vector2(-46,43),Vector2(-10,16),Vector2(16,16),Vector2(21,34),Vector2(-15,56),Vector2(-64,95)]),skin)
	for i in range(4):
		draw_line(Vector2(-17+i*9,23),Vector2(-27+i*9,-9-i*2),ink,12,true)
		draw_line(Vector2(-17+i*9,23),Vector2(-27+i*9,-9-i*2),skin,8,true)
	draw_set_transform(Vector2.ZERO)
