extends SceneTree
## Deterministic simulation checks: no graphics, wall clock, or saved care fixtures.
var failures: Array[String] = []
const Model = preload("res://scripts/care_state.gd")

func check(ok: bool, message: String) -> void:
	if not ok: failures.append(message)

func close(a: float, b: float) -> bool:
	return absf(a-b) < 0.002

func new_game():
	var game = load("res://scenes/courtyard.tscn").instantiate()
	game.preferences_path = "user://care-loop-test-prefs.cfg"
	game.keepsake_save_path = "user://care-loop-test-keepsakes.json"
	root.add_child(game)
	game.set_process(false)
	game.muted = true
	for node in [game.bowl,game.cleanup,game.baby_mess,game.grooming,game.bathing]:
		node.set_process(false)
	return game

func step(game, seconds: float, interval: float = 0.05) -> void:
	var remaining := seconds
	while remaining > 0.0000001:
		var dt := minf(interval,remaining)
		game._process(dt)
		remaining -= dt

func same(a: Dictionary, b: Dictionary) -> bool:
	return close(a.hunger,b.hunger) and close(a.energy,b.energy) and close(a.interest,b.interest)

func _initialize() -> void:
	call_deferred("run")

func run() -> void:
	var model = Model.new()
	model.hunger = -10
	model.energy = 1000
	model.interest = -50
	check(model.hunger == 0 and model.energy == 100 and model.interest == 0,"Assignments clamp all three values.")
	model.awake(100000)
	check(model.hunger == 100 and model.energy == 0 and model.interest == 100,"Long awake intervals stay bounded.")
	model.sleep_for(100000)
	check(model.energy == 100 and model.interest == 100,"Long sleep intervals stay bounded.")
	model.eat_bite()
	model.reset()
	check(model.hunger == Model.INITIAL_HUNGER and model.wants_play(),"New sessions start mildly hungry and willing, not distressed.")
	var before: Dictionary = model.snapshot()
	model.awake(-20)
	model.sleep_for(-20)
	check(model.snapshot() == before,"Negative intervals cannot reverse needs.")
	var game = new_game()
	# A refill or a relocated bowl is not nutrition; real bites are credited once.
	before = game.care.snapshot()
	game.bowl.refill()
	game.dragging = true
	game.bowl.position = game.SAFE_BOWL
	game.finish_bowl_drag()
	check(game.care.snapshot() == before,"Refilling and moving food do not satisfy hunger.")
	game.start_feeding()
	game._process(0.54)
	check(game.feeding_bites == 0 and game.bowl.pieces == 3,"Approaching food is not yet eaten.")
	game._process(0.02)
	var after_bite: float = game.care.hunger
	game._process(0)
	game._process(0.01)
	check(game.feeding_bites == 1 and game.bowl.pieces == 2 and close(game.care.hunger,after_bite+Model.HUNGER_PER_SECOND*0.01),"One mouth event gives one bite credit.")
	step(game,3)
	check(not game.care.wants_food() and game.bowl.pieces == 0,"A meal satisfies the baby.")
	game.bowl.refill()
	game.start_feeding()
	check(game.state == "idle" and game.bowl.pieces == 3 and game.care_signals.refusal > 0,"Full refusal preserves food and gives a visible lean.")
	check(not game.cleanup.has_mess() and not game.snack.visible,"Refusal does not punish with mess or phantom food.")
	game.start_cuddle()
	check(game.state == "cuddle","Fullness never gates affection.")
	game.reset_scene()
	game.care.hunger = 13
	game.start_feeding()
	step(game,1.1)
	check(game.bowl.pieces == 2 and game.state == "idle","A small appetite saves the rest of a bowl.")
	# Real bat events, not opening a toy or letting it sit, spend play resources.
	game.reset_scene()
	game.toggle_toy()
	before = game.care.snapshot()
	game.play.carrying = true
	step(game,2)
	check(close(game.care.energy,before.energy-2*Model.AWAKE_ENERGY_PER_SECOND),"Idle/held ball costs only ordinary awake time, not play energy.")
	game.play.carrying = false
	game.play.ball_at = game.paw.palm_position()
	game.play.cooldown = 0
	before = game.care.snapshot()
	game._process(0)
	check(game.play.boops == 1 and close(game.care.energy,before.energy-Model.BOOP_ENERGY) and close(game.care.interest,before.interest-Model.BOOP_INTEREST),"An actual paw bat spends energy and satisfies interest once.")
	game._process(0)
	check(game.play.boops == 1,"The same contact cannot repeatedly earn play credit.")
	game.care.energy = 0
	var baby_x: float = game.baby.position.x
	game.play.ball_at = Vector2(400,630)
	game.play.velocity.x = 80
	var boops: int = game.play.boops
	step(game,0.1)
	check(game.baby.position.x == baby_x and game.play.boops == boops and game.play.ball_at.x > 400,"Tired baby watches, but a thrown ball continues rolling.")
	check(game.status.contains("nap") and game.baby.texture == game.REST_ART,"Tired play has a visible restful face and explanation.")
	game.toggle_nap()
	check(game.play.mode == "nap","Rest stays reachable directly from tired play.")
	game.play.stop()
	game.toggle_toy()
	game.care.energy = 80
	game.care.interest = 0
	game._process(0)
	check(game.status.contains("Enough ball") and not game.care.wants_play(),"Satisfied is distinct from exhausted.")
	var key := InputEventKey.new()
	key.keycode = KEY_C
	key.pressed = true
	game.handle_at(key,Vector2.ZERO)
	check(game.state == "cuddle" and not game.play.active(),"C takes a tired or satisfied player straight to affection.")
	# Blanket, interrupted hold, sleeping time, waking, and reset are distinct.
	game.reset_scene()
	game.care.energy = 20
	game.toggle_nap()
	step(game,2)
	check(game.care.energy < 20 and not game.play.sleeping,"Entering nap alone cannot recharge energy.")
	game.play.tuck()
	game.play.key_contact = true
	step(game,1)
	var lifted: float = game.play.nap_body.position.y
	var held_energy: float = game.care.energy
	game.play.release_input()
	step(game,2)
	check(game.play.settling < 3 and game.care.energy < held_energy,"Interrupted settling cannot count as sleeping.")
	game.play.key_contact = true
	step(game,2)
	check(game.play.sleeping and game.play.nap_body.position.y > lifted,"Cheek settling visibly lowers the curled weight before sleep.")
	before = game.care.snapshot()
	step(game,5)
	check(close(game.care.energy,before.energy+5*Model.SLEEP_ENERGY_PER_SECOND) and close(game.care.hunger,before.hunger),"Only actual sleeping time restores energy without hunger demands.")
	game.toggle_nap()
	before = game.care.snapshot()
	step(game,2)
	check(game.state == "idle" and game.care.energy <= before.energy,"Wake-up animation and nap exit do not grant energy.")
	# All suspension paths freeze needs, including focus lost inside an album.
	for suspension in ["pause","album","cloud","focus","album-focus"]:
		game.reset_scene()
		if suspension == "pause": game.toggle_pause()
		if suspension in ["album","album-focus"]: game.toggle_case()
		if suspension == "cloud": game.toggle_cloud()
		if suspension in ["focus","album-focus"]: game.care_focus_changed(false)
		if suspension == "album-focus": game.toggle_case()
		before = game.care.snapshot()
		game._process(1000)
		check(game.care.snapshot() == before,"Needs freeze during "+suspension+".")
		game.care_focus_changed(true)
	game.reset_scene()
	game.reduced_motion = true
	game.album.store.placed["test-marker"] = {"x":10,"y":10,"angle":0}
	game.care.hunger = 100
	game.care.energy = 0
	game.reset_scene()
	check(game.care.snapshot() == Model.new().snapshot() and game.reduced_motion and game.album.store.placed.has("test-marker"),"Reset restores needs without erasing preferences or keepsakes.")
	game.album.store.placed.erase("test-marker")
	game.free()
	# Event timing and sleep boundaries are independent of rendering preferences/FPS.
	var baseline: Dictionary = {}
	for reduced in [false,true]:
		for interval in [0.1,1.0/60.0,4.0]:
			game = new_game()
			game.reduced_motion = reduced
			game.start_feeding()
			step(game,4,interval)
			var feeding: Dictionary = game.care.snapshot()
			check(game.bowl.pieces == 0,"Feeding cannot lose bites on slow frames.")
			game.care.energy = 20
			game.toggle_nap()
			game.play.tuck()
			game.play.key_contact = true
			step(game,8,interval)
			var trace := {"food":feeding,"sleep":game.care.snapshot()}
			if baseline.is_empty(): baseline = trace
			else: check(same(trace.food,baseline.food) and same(trace.sleep,baseline.sleep),"Care outcomes match at different frame rates and motion settings.")
			game.free()
	if failures.is_empty():
		print("Qilin responsive care checks: PASS")
		quit(0)
	else:
		for failure in failures: printerr("FAIL: "+failure)
		quit(1)
