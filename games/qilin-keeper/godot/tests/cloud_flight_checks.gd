extends SceneTree

var failures: Array[String] = []

func check(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)

func key(code: int, pressed: bool = true) -> InputEventKey:
	var event := InputEventKey.new()
	event.keycode = code
	event.pressed = pressed
	return event

func click(pressed: bool) -> InputEventMouseButton:
	var event := InputEventMouseButton.new()
	event.button_index = MOUSE_BUTTON_LEFT
	event.pressed = pressed
	return event

func _initialize() -> void:
	call_deferred("run_checks")

func run_checks() -> void:
	var game = load("res://scenes/courtyard.tscn").instantiate()
	root.add_child(game)
	game.set_process(false)
	check(not game.flight.active and not game.flight.shades.visible,"Native project begins in care without sunglasses.")
	game.cleanup.spawn(game.NEAR_BOWL)
	game.baby_mess.mark_dirty()
	game.grooming.tufts[0].ruffle = 0.35
	game.cup.water = 2
	var patches: int = game.cleanup.patches.size()
	var dirt: float = game.baby_mess.spots[0].remaining
	var position_before: Vector2 = game.baby.position
	game.handle_at(key(KEY_Y),Vector2.ZERO)
	check(game.flight.active and game.state == "flight","Y starts a real flight activity.")
	check(game.flight.shades.visible and game.flight.cloud.visible,"Glasses and cloud must be visible.")
	check(game.flight_button.focus_mode == Control.FOCUS_NONE,"Landing must not leave a button stealing Space from care.")
	check(game.flight.shades.get_parent() == game.baby,"Glasses must follow the face through turns.")
	check(not game.cleanup.visible and not game.grooming.is_processing(),"Care tools stay out of flight and their state is frozen.")
	game.flight.advance(1)
	check(game.baby.position.y < position_before.y and game.baby.scale.x < 0.5,"Takeoff visibly lifts the baby onto its cloud.")
	var start: Vector2 = game.flight.pilot
	game.handle_at(key(KEY_RIGHT),Vector2.ZERO)
	game.flight.advance(0.5)
	check(game.flight.pilot.x > start.x+50,"Holding Right must actually move through the courtyard.")
	game.handle_at(key(KEY_RIGHT,false),Vector2.ZERO)
	game.handle_at(click(true),Vector2(290,330))
	game.flight.advance(0.7)
	check(game.flight.pilot.x < start.x,"Mouse steering must work without keyboard input.")
	game.handle_at(click(false),Vector2(290,330))
	game.toggle_pause()
	var paused_at: Vector2 = game.baby.position
	game.flight.advance(2)
	check(game.baby.position == paused_at,"Pause freezes flight, including bobbing.")
	check(game.flight.held_keys.is_empty() and not game.flight.pointer_held,"Pause releases every steering gesture.")
	game.toggle_pause()
	check(not game.grooming.is_processing(),"Resuming flight must not resume hidden care simulations.")
	var touch := InputEventScreenTouch.new()
	touch.pressed = true
	touch.position = Vector2(900,390)
	game._unhandled_input(touch)
	check(game.flight.pointer_held and game.flight.pointer_target == touch.position,"Touch steering uses actual touch coordinates, not a stale mouse position.")
	touch.pressed = false
	game._unhandled_input(touch)
	game.handle_at(click(true),Vector2(-1000,-1000))
	for i in range(10):
		game.flight.advance(0.5)
	check(game.flight.BOUNDS.has_point(game.flight.pilot),"Dragging beyond the canvas stays safely in the courtyard.")
	game.handle_at(click(false),Vector2.ZERO)
	game.handle_at(key(KEY_ESCAPE),Vector2.ZERO)
	check(not game.flight.active and game.state == "idle","Escape lands and returns to care.")
	check(not game.flight.shades.visible and not game.flight.cloud.visible,"Landing removes flight-only accessories.")
	check(game.baby.position == position_before and game.cleanup.visible,"Landing restores the care layout.")
	check(game.cleanup.patches.size() == patches and game.baby_mess.spots[0].remaining == dirt,"Flight must neither clean nor lose existing mess.")
	check(game.grooming.tufts[0].ruffle == 0.35 and game.cup.water == 2,"Grooming progress and water survive the outing.")
	game.start_drinking()
	game.handle_at(key(KEY_Y),Vector2.ZERO)
	check(game.flight.active and not game.cup_dragging,"Flight safely interrupts a drink without a stuck cup.")
	game.handle_at(key(KEY_R),Vector2.ZERO)
	check(not game.flight.active and game.state == "idle" and game.cup.water == 3,"Reset exits flight and resets the care scene.")
	game.start_feeding()
	game.handle_at(key(KEY_Y),Vector2.ZERO)
	check(not game.flight.active,"An approaching bite finishes before starting a flight.")
	game.reset_scene()
	game.start_cuddle()
	check(not game.flight.start(),"A quiet cuddle cannot be interrupted by the flight button.")
	game.queue_free()
	if failures.is_empty():
		print("Qilin cloud flight checks: PASS")
		quit(0)
	else:
		for failure in failures:
			printerr("FAIL: "+failure)
		quit(1)
