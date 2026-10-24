extends SceneTree

const SAVE := "user://qilin-cassette-test.json"
var failures: Array[String] = []

func check(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)

func key(code: int) -> InputEventKey:
	var event := InputEventKey.new()
	event.keycode = code
	event.pressed = true
	return event

func mouse(pressed: bool) -> InputEventMouseButton:
	var event := InputEventMouseButton.new()
	event.button_index = MOUSE_BUTTON_LEFT
	event.pressed = pressed
	return event

func move() -> InputEventMouseMotion:
	return InputEventMouseMotion.new()

func same_layout(actual: Dictionary, expected: Dictionary) -> bool:
	if actual.size() != expected.size():
		return false
	for id in expected:
		if not actual.has(id):
			return false
		for field in ["x","y","angle"]:
			if not is_equal_approx(float(actual[id][field]),float(expected[id][field])):
				return false
	return true

func _initialize() -> void:
	call_deferred("run_checks")

func make_game() -> Node2D:
	var game = load("res://scenes/courtyard.tscn").instantiate()
	game.keepsake_save_path = SAVE
	root.add_child(game)
	game.set_process(false)
	return game

func run_checks() -> void:
	if FileAccess.file_exists(SAVE):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(SAVE))
	var game = make_game()
	var album = game.album
	check(album.store.earned.is_empty(),"Fresh collection starts locked, not pre-awarded.")
	game.cleanup.spawn(game.NEAR_BOWL)
	game.baby_mess.mark_dirty()
	game.grooming.tufts[0].ruffle = 0.35
	game.cup.water = 2
	var patches: int = game.cleanup.patches.size()
	game.flight.start()
	game.flight.advance(0.5)
	check(album.store.earned.is_empty(),"A cancelled takeoff is not a completed flight.")
	game.flight.advance(0.5)
	check(album.store.earned == ["first_flight"],"Actual takeoff earns the flight souvenir.")
	game.flight.advance(2)
	check(album.store.earned.size() == 1,"Repeated frames never duplicate keepsakes.")
	check(album.open_case(),"Can decorate while flying.")
	var phase: float = game.flight.phase
	game._process(3)
	check(game.flight.phase == phase,"Decorating freezes flight.")
	game.handle_at(key(KEY_Y),Vector2.ZERO)
	check(game.flight.active,"Case input must not accidentally land or trigger care.")
	album.close_case()
	check(not game.grooming.is_processing(),"Closing a flying case keeps hidden care frozen.")
	game.flight.land()
	check(album.store.earned.size() == 2,"Manual landing earns the second souvenir.")
	check(album.open_case(),"Case opens during care.")
	check(not game.grooming.is_processing(),"Care simulations rest while decorating.")
	album.handle_at(mouse(true),Vector2(200,320))
	album.handle_at(mouse(false),Vector2(200,320))
	check(album.selected == "first_flight","Click-release pickup works, not just held drag.")
	album.handle_at(key(KEY_E),Vector2.ZERO)
	album.handle_at(mouse(true),Vector2(560,370))
	check(album.store.placed.has("first_flight") and album.store.placed.first_flight.angle > 0,"Click-place saves a turned sticker.")
	album.handle_at(mouse(true),Vector2(200,528))
	album.handle_at(move(),Vector2(870,385))
	album.handle_at(mouse(false),Vector2(870,385))
	check(album.store.placed.has("first_landing"),"Held-drag places the second sticker.")
	for id in album.store.placed:
		var at: Vector2 = album.center(id)
		var bounds := Rect2(at-Vector2.ONE*72,Vector2.ONE*144)
		var corners: Array[Vector2] = []
		for corner in [Vector2(-72,-72),Vector2(72,-72),Vector2(-72,72),Vector2(72,72)]:
			corners.append(at+corner.rotated(float(album.store.placed[id].angle)))
		var lowest := bounds.end.y
		for corner in corners:
			lowest = maxf(lowest,corner.y)
		check(lowest < 434,"Even rotated stickers stay above the central spindle openings.")
	var original: Dictionary = album.store.placed.first_landing.duplicate()
	album.pick("first_landing",album.center("first_landing"),true)
	album.handle_at(move(),Vector2(50,50))
	album.handle_at(mouse(false),Vector2(50,50))
	check(album.store.placed.first_landing == original,"Invalid drops preserve the previous position.")
	album.handle_at(key(KEY_2),Vector2.ZERO)
	album.handle_at(key(KEY_DELETE),Vector2.ZERO)
	check(not album.store.placed.has("first_landing") and "first_landing" in album.store.earned,"Return-to-tray keeps the earned souvenir.")
	album.handle_at(key(KEY_2),Vector2.ZERO)
	album.handle_at(key(KEY_ENTER),Vector2.ZERO)
	var touch := InputEventScreenTouch.new()
	touch.pressed = true
	album.handle_at(touch,Vector2(200,320))
	touch.pressed = false
	album.handle_at(touch,Vector2(200,320))
	touch.pressed = true
	album.handle_at(touch,Vector2(650,380))
	var emulated := mouse(true)
	emulated.device = -1
	album.handle_at(emulated,Vector2(650,380))
	check(album.selected.is_empty(),"An emulated mouse event cannot pick up a just-placed touch sticker.")
	album.close_case()
	check(game.grooming.is_processing(),"Closing restores care processing.")
	check(game.cleanup.patches.size() == patches and game.cup.water == 2 and game.grooming.tufts[0].ruffle == 0.35,"Decorating preserves mess, water, and grooming progress.")
	check(album.store.last_error.is_empty(),"Saving succeeds, not just a visual fake.")
	var saved: Dictionary = album.store.placed.duplicate(true)
	game.reset_scene()
	check(album.store.earned.size() == 2 and album.store.placed == saved,"Care reset does not erase stickers.")
	game.free()
	game = make_game()
	album = game.album
	check(album.store.earned.size() == 2 and same_layout(album.store.placed,saved),"Reopening the native project restores decoration.")
	game.start_cuddle()
	check(not album.open_case(),"Quiet affection is protected from opening the case.")
	game.reset_scene()
	game.grooming.quiet_time = 3
	check(not album.open_case(),"Grooming's satisfied huff gets to finish.")
	game.grooming.quiet_time = 0
	game.toggle_pause()
	album.open_case()
	album.close_case()
	check(game.paused and not game.grooming.is_processing(),"Opening and closing do not undo a deliberate pause.")
	game.free()
	var file := FileAccess.open(SAVE,FileAccess.WRITE)
	file.store_string("{not valid json")
	file.close()
	game = make_game()
	album = game.album
	check(album.store.damaged_save and not album.store.last_error.is_empty(),"Corrupt save is reported explicitly.")
	album.award("first_flight")
	check(FileAccess.get_file_as_string(SAVE) == "{not valid json","A corrupt save is not silently overwritten.")
	game.free()
	DirAccess.remove_absolute(ProjectSettings.globalize_path(SAVE))
	if failures.is_empty():
		print("Qilin cassette checks: PASS")
		quit(0)
	else:
		for failure in failures:
			printerr("FAIL: "+failure)
		quit(1)
