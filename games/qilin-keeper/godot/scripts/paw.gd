extends Node2D
## Articulated forelimb extracted from the approved character illustration.

var amount := 0.0

func _ready() -> void:
	var art := Sprite2D.new()
	art.texture = preload("res://assets/paw.png")
	art.centered = false
	# Parent is the character Sprite2D: inherit its scale, lean and breathing.
	art.position = Vector2(45-292,605-750)
	add_child(art)

func palm_position() -> Vector2:
	return to_global(Vector2(135-292,706-750))
