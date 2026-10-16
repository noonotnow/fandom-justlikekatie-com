extends SceneTree
## Compare semantic traces, not only final positions, under both preferences.

const PREFS := "user://motion-activity-checks.cfg"
const KEEPSAKES := "user://motion-activity-checks.json"
var failures: Array[String] = []

func check(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)

func key(code: int, pressed: bool = true) -> InputEventKey:
	var event := InputEventKey.new()
	event.keycode = code
	event.pressed = pressed
	return event

func touch(pressed: bool) -> InputEventScreenTouch:
	var event := InputEventScreenTouch.new()
	event.pressed = pressed
	return event

func care(game) -> Array:
	return [game.bowl.pieces,game.cup.water,game.cleanup.patches.duplicate(true),
		game.baby_mess.spots.duplicate(true),game.grooming.tufts.duplicate(true),
		game.bathing.patches.duplicate(true),game.album.store.placed.duplicate(true)]

func _initialize() -> void:
	call_deferred("run")

func run() -> void:
	DirAccess.remove_absolute(PREFS)
	DirAccess.remove_absolute(KEEPSAKES)
	var game = load("res://scenes/courtyard.tscn").instantiate()
	game.preferences_path = PREFS
	game.keepsake_save_path = KEEPSAKES
	root.add_child(game)
	game.set_process(false)
	game.muted = true
	for node in [game.bowl,game.cleanup,game.baby_mess,game.grooming,game.bathing]:
		node.set_process(false)
	game.baby_mess.mark_dirty()
	game.cleanup.spawn(game.NEAR_BOWL)
	game.grooming.tufts[0].ruffle = 0.35
	game.cup.water = 2
	var saved_care := care(game)
	var saved_pose: Transform2D = game.baby.transform
	var baseline: Array = []
	var full_visuals: Array = []

	for reduced in [false,true]:
		game.reduced_motion = reduced
		game.album.store.earned.clear()
		game.album.store.placed.clear()
		game.flight.start()
		var duration: float = game.flight.takeoff_duration
		check(is_equal_approx(duration,0.2 if reduced else 0.9),"Takeoff is shorter only as a visual transition.")
		game.flight.advance(0.2)
		check(game.album.store.earned.is_empty(),"A shortened takeoff cannot earn the flight sticker early.")
		if reduced:
			check(game.baby.position.distance_to(game.flight.pilot) < 2,"Reduced takeoff reaches the pilot without a long animated rise.")
		game.flight.land()
		check(game.album.store.earned.is_empty(),"Landing before 0.9 seconds cannot earn either sticker.")
		game.flight.start()
		var trace: Array = []
		for i in 100:
			if i == 3:
				game.flight.handle_at(key(KEY_RIGHT),Vector2.ZERO)
			if i == 20:
				game.flight.handle_at(key(KEY_UP),Vector2.ZERO)
			if i == 35:
				game.flight.release_input()
				game.flight.handle_at(touch(true),Vector2(280,320))
			if i == 60:
				game.flight.handle_at(touch(false),Vector2.ZERO)
			if i == 70:
				game.toggle_pause()
				var at: Transform2D = game.baby.transform
				game.flight.advance(2)
				check(game.baby.transform == at,"Pause freezes either flight visual setting.")
				game.toggle_pause()
			game.flight.advance(0.05)
			trace.append([game.flight.pilot,game.flight.velocity,game.flight.phase,
				game.album.store.earned.duplicate(),game.state,game.status])
			if i == 50:
				var factor := 0.15 if reduced else 1.0
				var bob := Vector2(sin(game.flight.phase*0.7)*7,sin(game.flight.phase*1.8)*6)*factor
				check(game.baby.position.is_equal_approx(game.flight.pilot+bob),"Cloud bob amplitude follows the preference.")
				check(is_equal_approx(game.paw.rotation,-0.09+sin(game.flight.phase*1.4)*0.035*factor),"Attached paw sway follows the preference.")
			if reduced:
				check(game.flight.trail.is_empty(),"Reduced flight suppresses decorative trail puffs.")
		if not reduced:
			baseline = trace
			check(not game.flight.trail.is_empty(),"Full motion retains the flight trail.")
		else:
			check(trace == baseline,"Keyboard/touch steering, bounds, sticker timing and status are identical.")
		game.flight.land()
		check(game.album.store.earned == ["first_flight","first_landing"],"Both settings award the same flight and landing stickers.")
		check(game.baby.transform.is_equal_approx(saved_pose),"Landing restores the standing care pose.")
		check(care(game) == saved_care,"Both flight settings preserve care and placed stickers.")

	# Changing the setting during takeoff keeps its captured duration, while
	# decorative motion and existing trail puffs respond immediately.
	game.reduced_motion = false
	game.flight.start()
	game.flight.advance(0.1)
	game.reduced_motion = true
	game.flight.advance(0.1)
	check(game.flight.takeoff_duration == 0.9,"Mid-takeoff preference change cannot rewind the transition.")
	game.reduced_motion = false
	game.flight.handle_at(key(KEY_RIGHT),Vector2.ZERO)
	game.flight.advance(1)
	check(not game.flight.trail.is_empty(),"Fixture creates a full-motion trail.")
	game.reduced_motion = true
	game.flight.advance(0)
	check(game.flight.trail.is_empty(),"Turning reduced motion on removes existing puffs.")
	game.flight.land()

	for reduced in [false,true]:
		game.reduced_motion = reduced
		game.play.start("toy")
		var trace: Array = []
		# Actual touch pickup/release; fixed gesture velocity keeps the comparison
		# independent of wall-clock timing in the test runner.
		game.play.handle_at(touch(true),game.play.ball_at)
		check(game.play.carrying,"Both settings use the same ball pickup target.")
		game.play.throw_velocity = Vector2(300,0)
		game.play.handle_at(touch(false),game.play.ball_at)
		check(not game.play.carrying and game.play.velocity.x == 180,"Both settings apply identical release physics.")
		for i in 300:
			if i == 80:
				game.play.handle_at(key(KEY_RIGHT),Vector2.ZERO)
			if i == 100:
				game.play.handle_at(key(KEY_RIGHT,false),Vector2.ZERO)
			if i == 150:
				game.play.handle_at(key(KEY_SPACE),Vector2.ZERO)
			if i == 180:
				game.toggle_pause()
				var at: Vector2 = game.play.ball_at
				game.play.advance(2)
				check(game.play.ball_at == at and game.play.held.is_empty(),"Pause freezes ball physics and releases input in both settings.")
				game.toggle_pause()
			game.play.advance(0.05)
			trace.append([game.play.ball_at,game.play.velocity,game.play.ball_turn,
				game.play.boops,game.play.cooldown,game.play.tap_time,game.baby.position.x,game.state,game.status])
			if not reduced:
				full_visuals.append([game.baby.position.y,game.paw.rotation])
			else:
				check(is_equal_approx(game.baby.position.y,lerpf(game.HOME.y,full_visuals[i][0],0.15)),"Reduced toy bounce retains only 15 percent of decoration.")
				check(is_equal_approx(game.paw.rotation,lerpf(-0.45,full_visuals[i][1],0.15)),"Reduced paw bounce cannot alter boop contact.")
		check(game.play.boops > 0,"Both settings actually bat the rolling ball.")
		if not reduced:
			baseline = trace
		else:
			check(trace == baseline,"Ball trajectory, rotation, following, cooldown, boops and feedback match at every simulation step.")
		game.play.stop()
		check(game.baby.transform.is_equal_approx(saved_pose),"Putting away either toy restores the care pose.")
		check(care(game) == saved_care,"Both toy settings preserve all care and placed stickers.")
		check(game.album.store.earned == ["first_flight","first_landing"],"Toy decoration cannot change earned stickers.")

	game.free()
	DirAccess.remove_absolute(PREFS)
	DirAccess.remove_absolute(KEEPSAKES)
	if failures.is_empty():
		print("Qilin motion activity checks: PASS")
		quit(0)
	else:
		for failure in failures:
			printerr("FAIL: "+failure)
		quit(1)
