extends SceneTree
## Native input and care-state regressions, independent of browser screenshots.
var failures := 0

func check(ok: bool, message: String) -> void:
	if not ok:
		failures += 1
		push_error(message)

func key(game: Node, code: int) -> void:
	var event := InputEventKey.new()
	event.keycode = code
	event.pressed = true
	game.handle_at(event,Vector2.ZERO)

func click(game: Node, at: Vector2, pressed: bool) -> void:
	var event := InputEventMouseButton.new()
	event.button_index = MOUSE_BUTTON_LEFT
	event.pressed = pressed
	game.handle_at(event,at)

func motion(game: Node, at: Vector2) -> void:
	game.handle_at(InputEventMouseMotion.new(),at)

func _initialize() -> void:
	call_deferred("run")

func run() -> void:
	var game = load("res://scenes/courtyard.tscn").instantiate()
	root.add_child(game)
	game.set_process(false)
	game.muted = true
	game._process(0.1)
	check(game.glance_active and game.baby.texture == game.GLANCE_LEFT,"Idle glance must consistently point toward the favorite cup.")
	game.cup.position = Vector2(1040,660)
	game._process(0.1)
	check(game.baby.texture == game.GLANCE_RIGHT,"Glance must follow the cup when moved.")
	# Continuous mouse pickup, lift and release, not a shortcut-only test.
	game.reset_scene()
	click(game,game.cup.HOME,true)
	check(game.cup_dragging,"Mouse must pick up the physical cup.")
	motion(game,game.MOUTH)
	check(game.cup.position == game.MOUTH,"Held cup must follow mouse to the snout.")
	click(game,game.MOUTH,false)
	check(game.state == "drinking" and not game.cup_dragging,"Release at snout must start sipping.")
	game._process(0.7)
	check(game.baby.texture == game.REST_ART and game.cup.rotation != 0,"Drinking must visibly relax the eyes and tilt the cup.")
	var at: Vector2 = game.cup.position
	check(at.distance_to(game.MOUTH) < 40,"Cup rim must meet the snout, not float elsewhere.")
	game._process(0.3)
	check(game.cup.water == 2,"A visible sip must consume water.")
	key(game,KEY_P)
	var before: float = game.state_time
	var pose: Vector2 = game.cup.position
	game._process(10)
	check(game.state_time == before and game.cup.water == 2 and game.cup.position == pose,"Pause must freeze sip time, water and pose.")
	key(game,KEY_P)
	game._process(2.1)
	check(game.state == "idle" and game.cup.completed and game.cup.water == 0,"Sipping must have a clear completed state.")
	check(game.cup.position == game.cup.HOME and game.status.contains("Sips finished"),"Finished cup must return to its place with completion feedback.")
	check(not game.cleanup.has_mess(),"Drinking must not invent food or floor mess.")
	key(game,KEY_J)
	check(game.cup.water == 3 and not game.cup.completed and game.state == "idle","J on an empty cup must refill without silent drinking.")
	key(game,KEY_J)
	check(game.state == "drinking","J must offer accessible drinking independently of D for drying.")
	game._process(1)
	key(game,KEY_T)
	check(game.state == "idle" and game.grooming.selected and game.cup.water == 2,"Keyboard tool switching must safely keep remaining water.")
	key(game,KEY_J)
	check(not game.grooming.selected and game.state == "drinking","Drinking must put away the previous tool.")
	click(game,game.grooming.TRAY,true)
	check(game.state == "idle" and game.grooming.selected and not game.cup_dragging,"Mouse tool pickup must interrupt sipping safely.")
	click(game,game.grooming.TRAY,false)
	key(game,KEY_J)
	key(game,KEY_ESCAPE)
	check(game.state == "idle" and game.cup.position == game.cup.HOME,"Escape must safely set down a lifted cup.")
	key(game,KEY_J)
	key(game,KEY_C)
	game._process(0.5)
	check(game.state == "cuddle" and not game.glance_active,"Affection must interrupt drinking and suppress preference demands.")
	key(game,KEY_J)
	check(game.state == "cuddle","Drinking must not interrupt held affection.")
	game.reset_scene()
	click(game,game.cup.HOME,true)
	key(game,KEY_P)
	check(not game.cup_dragging and game.cup.position == game.cup.HOME,"Pause during pickup must release the held cup safely.")
	click(game,game.MOUTH,false)
	key(game,KEY_P)
	check(game.state == "idle","A paused mouse release must never cause a phantom drink.")
	key(game,KEY_J)
	key(game,KEY_R)
	check(game.state == "idle" and game.cup.water == 3 and not game.cup.completed,"Reset mid-sip must fully restore the cup.")
	# Missed drops are safe and accessible on visible floor.
	click(game,game.cup.HOME,true)
	motion(game,Vector2(760,630))
	click(game,Vector2(760,630),false)
	check(not game.cup_dragging and game.state == "idle" and game.cup.water == 3,"A missed offer must not consume or spill water.")
	check(game.care_surfaces.clear_floor_footprint(game.cup.position,Vector2(45,32)),"A set-down cup must remain on visible floor.")
	# Isolate water from food and body residue; same affectionate swat.
	game.reset_scene()
	game.bowl.position = game.SAFE_BOWL
	key(game,KEY_U)
	check(game.cup.position == game.cup.NEAR,"Keyboard must also move the cup into reach.")
	game.raise_paw()
	game.meet_paw()
	game._process(1.7)
	game._process(0.3)
	check(game.high_five and game.cup.spilled and game.cup.water == 0,"A water spill must preserve the high-five.")
	check(game.cleanup.foods.is_empty() and game.cleanup.patches.size() == 2 and not game.baby_mess.has_mess(),"Water must create only floor puddles, no fallen fruit or dirty baby.")
	for patch in game.cleanup.patches:
		check(patch.get("water",false) and game.care_surfaces.clear_floor_footprint(patch.at,Vector2(40,25)),"Water puddles must be blue and accessible off the body/paw.")
	key(game,KEY_G)
	check(game.cleanup.gathered == 0,"Water must not enter compost.")
	key(game,KEY_V)
	check(game.cleanup.mop_selected,"Water must allow mopping immediately, without compost.")
	var initial: Array = game.cleanup.patches.duplicate(true)
	game.cleanup.scrubbing = true
	var paw_at: Vector2 = game.baby_mess.point("paw")
	game.cleanup.wipe(paw_at-Vector2(8,0),paw_at+Vector2(8,0))
	check(game.cleanup.patches == initial,"Visible paw/body targeting must block mop contact.")
	for patch in initial:
		for i in 14:
			game.cleanup.wipe(patch.at-Vector2(18,0),patch.at+Vector2(18,0))
	check(not game.cleanup.has_mess() and game.cleanup.completed,"Water-only mopping must complete without other cleanup jobs.")
	# Mixed spills stay separate and refilling cannot erase either.
	game.reset_scene()
	game.cleanup.spawn(game.NEAR_BOWL)
	var food: Array = game.cleanup.foods.duplicate()
	var baby_spots: Array = game.baby_mess.spots.duplicate(true)
	game.cleanup.spawn_water(game.cup.NEAR)
	check(game.cleanup.foods == food and game.baby_mess.spots == baby_spots and game.cleanup.patches.size() == 5,"Water must not alter existing food or baby residue.")
	game.cup.spill()
	click(game,game.cup.HOME,true)
	click(game,game.cup.HOME,false)
	check(game.cup.water == 3 and game.cleanup.patches.size() == 5,"Refilling the cup must leave mixed spills intact.")
	game.start_cuddle()
	check(game.state == "cuddle" and game.cleanup.has_mess(),"Mess must never gate affection.")
	game.reset_scene()
	check(not game.cleanup.has_mess() and game.cup.water == 3,"Reset must clear water alongside existing cleanup.")
	# Cup and bath gestures must share one unambiguous tool routing path.
	for kind in 3:
		game.reset_scene()
		key(game,KEY_J)
		game._process(1)
		click(game,game.bathing.HOMES[kind],true)
		check(game.state == "idle" and game.bathing.selected == kind and game.bathing.scrubbing and game.cup.water == 2,"Physical bath pickup must interrupt sipping safely and preserve remaining water.")
		click(game,game.bathing.HOMES[kind],false)
		check(not game.bathing.scrubbing,"Bath release must not leave a held cursor.")
		game.bathing.patches[0].wash = 0.5
		click(game,game.cup.HOME,true)
		check(game.cup_dragging and game.bathing.selected == -1 and game.bathing.patches[0].wash == 0.5,"Physical cup pickup must put away the bath tool without erasing lather.")
		click(game,game.bathing.HOMES[kind],true)
		check(not game.cup_dragging and game.cup.position == game.cup.HOME and game.bathing.selected == kind,"Physical bath pickup must return a held cup before equipping.")
		key(game,KEY_J)
		check(game.bathing.selected == -1 and game.state == "drinking" and game.bathing.patches[0].wash == 0.5,"Keyboard drinking must return the bath tool and preserve lather.")
		key(game,KEY_D)
		check(game.state == "idle" and game.bathing.selected == 2,"D must select drying, not drinking.")
		key(game,KEY_U)
		check(game.bathing.selected == -1 and game.cup.position == game.cup.NEAR,"Moving the cup must return any held bath tool.")
	game.reset_scene()
	print("Qilin drinking checks: ", "PASS" if failures == 0 else "FAIL (%d)" % failures)
	game.free()
	call_deferred("quit",0 if failures == 0 else 1)
