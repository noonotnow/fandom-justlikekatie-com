extends SceneTree

var failures: Array[String] = []

func check(ok: bool, message: String) -> void:
	if not ok: failures.append(message)

func key(code: int, pressed: bool = true) -> InputEventKey:
	var event := InputEventKey.new()
	event.keycode = code
	event.pressed = pressed
	return event

func mouse(pressed: bool) -> InputEventMouseButton:
	var event := InputEventMouseButton.new()
	event.button_index = MOUSE_BUTTON_LEFT
	event.pressed = pressed
	return event

func move() -> InputEventMouseMotion:
	return InputEventMouseMotion.new()

func touch(at: Vector2, pressed: bool, index: int = 0, canceled: bool = false) -> InputEventScreenTouch:
	var event := InputEventScreenTouch.new()
	event.position = at
	event.pressed = pressed
	event.index = index
	event.canceled = canceled
	return event

func touch_drag(at: Vector2, index: int = 0) -> InputEventScreenDrag:
	var event := InputEventScreenDrag.new()
	event.position = at
	event.index = index
	return event

func send_touch(game: Node, at: Vector2, pressed: bool, index: int = 0, canceled: bool = false) -> void:
	game._unhandled_input(touch(at,pressed,index,canceled))

func touch_checks(game: Node) -> void:
	game.baby_mess.mark_dirty()
	game.cleanup.spawn(game.NEAR_BOWL)
	var dirt: float = game.baby_mess.spots[0].remaining
	var patches: int = game.cleanup.patches.size()
	game.toggle_nap()
	send_touch(game,game.play.BLANKET_HOME,true,1)
	check(not game.play.carrying,"A second finger cannot pick up the blanket.")
	send_touch(game,game.play.BLANKET_HOME,true)
	game._unhandled_input(touch_drag(Vector2(780,520)))
	send_touch(game,Vector2(780,520),false,0,true)
	check(not game.play.blanketed and not game.play.carrying and game.play.blanket_at == game.play.BLANKET_HOME,"Canceled touch returns the blanket without tucking.")
	send_touch(game,game.play.BLANKET_HOME,true)
	game._unhandled_input(touch_drag(Vector2(400,250)))
	send_touch(game,Vector2(400,250),false)
	check(not game.play.blanketed and game.play.blanket_at == game.play.BLANKET_HOME,"Invalid touch drop safely returns the blanket.")
	send_touch(game,game.play.BLANKET_HOME,true)
	game._unhandled_input(touch_drag(Vector2(780,520)))
	game.play._on_window_resized()
	check(not game.play.blanketed and not game.play.carrying and game.play.blanket_at == game.play.BLANKET_HOME,"Resize cancels a blanket drag rather than tucking it.")
	game._unhandled_input(touch_drag(Vector2(780,520)))
	send_touch(game,Vector2(780,520),false)
	check(not game.play.blanketed,"Stale move/release after resize cannot tuck the blanket.")
	send_touch(game,game.play.BLANKET_HOME,true)
	game._unhandled_input(touch_drag(Vector2(780,520)))
	send_touch(game,Vector2(780,520),false)
	game._process(1)
	check(game.play.blanketed and game.play.pose_mix == 1,"Native touch drag tucks the dedicated curled pose.")
	var cheek: Vector2 = game.play.cheek()
	check(cheek.y > game.CHEEK.y+40,"Native touch contact follows the lowered head.")
	check(cheek.is_equal_approx(game.play.nap_body.to_global(game.play.NAP_ART.get_size()*game.play.NAP_CHEEK+game.play.nap_body.offset)),"Touch anchor uses the curled sprite's actual transform.")
	send_touch(game,Vector2(100,700),true)
	game._process(0.2)
	check(not game.play.contact and game.play.settling == 0,"Touch away from the lowered cheek cannot settle the curled pose.")
	send_touch(game,Vector2(100,700),false)
	send_touch(game,cheek,true)
	game._process(0.4)
	check(game.play.contact and game.play.settling > 0,"Touch at the lowered cheek starts settling.")
	var before_resize: float = game.play.settling
	game.play._on_window_resized()
	game._unhandled_input(touch_drag(game.play.cheek()))
	game._process(1)
	check(not game.play.contact and game.play.settling == before_resize and game.play.blanketed,"Resize cancels cheek contact without losing settling or reviving it on stale motion.")
	send_touch(game,cheek,false)
	send_touch(game,game.play.cheek(),true)
	send_touch(game,cheek,false,1)
	check(game.play.contact,"A second finger's release cannot cancel the primary hold.")
	game._unhandled_input(touch_drag(cheek+Vector2(200,0)))
	check(not game.play.contact,"Dragging away from the cheek releases contact.")
	var settled: float = game.play.settling
	game._process(1)
	check(game.play.settling == settled,"Settling does not continue after dragging away.")
	send_touch(game,cheek,false)
	send_touch(game,game.play.cheek(),true)
	game._process(0.4)
	send_touch(game,game.play.cheek(),false,0,true)
	settled = game.play.settling
	game._process(1)
	check(not game.play.contact and game.play.settling == settled,"Canceled cheek touch cannot leave contact stuck.")
	send_touch(game,game.play.cheek(),true)
	game._process(0.4)
	game._notification(Node.NOTIFICATION_APPLICATION_FOCUS_OUT)
	settled = game.play.settling
	game._process(5)
	check(game.paused and not game.play.contact and game.play.settling == settled,"Focus loss pauses and releases a native touch hold.")
	send_touch(game,game.play.cheek(),false)
	game.toggle_pause()
	game._process(1)
	check(game.play.settling == settled,"Resume cannot revive a released touch hold.")
	send_touch(game,game.play.cheek(),true)
	game._process(0.3)
	send_touch(game,game.play.cheek(),false)
	settled = game.play.settling
	game._process(1)
	check(not game.play.contact and game.play.settling == settled,"Normal touch release stops settling without losing progress.")
	send_touch(game,game.play.cheek(),true)
	game._process(3)
	send_touch(game,game.play.cheek(),false)
	check(game.play.sleeping,"A fresh held touch completes settling after interruptions.")
	game.play._on_window_resized()
	check(game.play.sleeping and game.play.mode == "nap" and not game.play.contact,"Resizing asleep does not wake the baby.")
	send_touch(game,Vector2(100,700),true)
	send_touch(game,Vector2(100,700),false)
	check(game.play.sleeping,"An unrelated touch does not wake the baby.")
	send_touch(game,game.play.cheek(),true)
	send_touch(game,game.play.cheek(),false)
	check(game.play.waking and not game.play.sleeping,"Touch tap on the lowered cheek starts the sleepy wake-up stretch.")
	game._process(0.6)
	check(game.play.wake_body.visible and not game.play.contact,"Touch release does not leave contact stuck during waking.")
	game._process(game.play.WAKE_DURATION)
	check(not game.play.active() and game.state == "idle","Touch tap on the lowered cheek wakes and restores care.")
	check(game.baby_mess.visible and game.grooming.visible and game.bathing.visible,"Touch wake restores all hidden care overlays.")
	check(game.baby_mess.spots[0].remaining == dirt and game.cleanup.patches.size() == patches,"Touch nap/wake preserves baby dirt and floor mess.")
	game.reset_scene()

func begin_wake(game) -> void:
	game.toggle_nap()
	game.play.tuck()
	game._process(0.4)
	game.handle_at(key(KEY_C),Vector2.ZERO)
	game._process(3)
	game.handle_at(key(KEY_C,false),Vector2.ZERO)
	game.toggle_nap()

func _initialize() -> void:
	call_deferred("run_checks")

func care_snapshot(game: Node) -> Dictionary:
	var dirt: Array = []
	for spot in game.baby_mess.spots:
		dirt.append(spot.remaining)
	var ruffles: Array = []
	for tuft in game.grooming.tufts:
		ruffles.append(tuft.ruffle)
	return {"dirt":dirt,"patches":game.cleanup.patches.duplicate(true),"ruffles":ruffles,"water":game.cup.water,"snacks":game.bowl.pieces,"bowl_at":game.bowl.position,"spilled":game.bowl.spilled,"stickers":game.album.store.placed.duplicate(true)}

func ball_touch_checks(game: Node) -> void:
	game.cleanup.spawn(game.NEAR_BOWL)
	game.baby_mess.mark_dirty()
	game.grooming.tufts[0].ruffle = 0.35
	game.cup.water = 2
	game.bowl.eat_one()
	var care := care_snapshot(game)
	var pose: Vector2 = game.baby.position
	game.toggle_toy()
	check(game.play.mode == "toy" and not game.bowl.is_processing(),"Touch ball play freezes care simulation.")
	send_touch(game,Vector2(100,700),true)
	send_touch(game,game.play.ball_at,true,1)
	game._unhandled_input(touch_drag(Vector2(480,610),1))
	send_touch(game,Vector2(480,610),false,1)
	check(not game.play.carrying and game.play.ball_at == Vector2(360,630),"Extra finger cannot pick up or move an unheld ball.")
	send_touch(game,Vector2(100,700),false)
	send_touch(game,game.play.ball_at,true)
	check(game.play.carrying and game.play.velocity == Vector2.ZERO,"Primary touch picks up the ball and stops rolling.")
	game._unhandled_input(touch_drag(Vector2(450,615)))
	check(game.play.ball_at == Vector2(450,615) and game.play.throw_velocity.x > 0,"Native drag tracks the finger and samples release velocity.")
	var sample: Vector2 = game.play.throw_velocity
	var emulated_motion := InputEventMouseMotion.new()
	emulated_motion.device = -1
	game.handle_at(emulated_motion,Vector2(900,600))
	check(game.play.ball_at == Vector2(450,615) and game.play.throw_velocity == sample,"Touch-emulated mouse motion cannot overwrite the primary touch's throw sample.")
	send_touch(game,Vector2(900,600),true,1)
	game._unhandled_input(touch_drag(Vector2(900,600),1))
	send_touch(game,Vector2(900,600),false,1,true)
	send_touch(game,Vector2(900,600),false,1)
	check(game.play.carrying and game.play.ball_at == Vector2(450,615) and game.play.throw_velocity == sample,"Extra finger press, drag, cancellation and release cannot steal the primary drag.")
	send_touch(game,Vector2(450,615),false)
	check(not game.play.carrying and is_equal_approx(game.play.velocity.x,clampf(sample.x*0.6,-360,360)),"Intentional native touch release applies bounded throw velocity.")
	var released: Vector2 = game.play.ball_at
	game._process(0.1)
	check(game.play.ball_at.x > released.x,"Intentional touch release actually rolls the ball.")
	# Keep cancellation away from the paw, so a deliberate baby bat is not confused with an unintended throw.
	send_touch(game,game.play.ball_at,true)
	game._unhandled_input(touch_drag(Vector2(400,610)))
	send_touch(game,Vector2(400,610),false,0,true)
	check(not game.play.carrying and game.play.velocity == Vector2.ZERO and game.play.throw_velocity == Vector2.ZERO,"Canceled native drag clears carrying and both velocities.")
	game._unhandled_input(touch_drag(Vector2(600,610)))
	send_touch(game,Vector2(600,610),false)
	game._process(0.1)
	check(game.play.ball_at == Vector2(400,610) and game.play.velocity == Vector2.ZERO,"Late move/release after cancellation cannot move or throw the ball.")
	for focus_loss in [false,true]:
		send_touch(game,game.play.ball_at,true)
		game._unhandled_input(touch_drag(Vector2(440,610)))
		if focus_loss:
			game._notification(Node.NOTIFICATION_APPLICATION_FOCUS_OUT)
		else:
			game.toggle_pause()
		var frozen: Vector2 = game.play.ball_at
		check(game.paused and not game.play.carrying and game.play.throw_velocity == Vector2.ZERO and game.play.velocity == Vector2.ZERO,"Pause/focus loss cancels a held ball without throwing.")
		game._unhandled_input(touch_drag(Vector2(600,610)))
		send_touch(game,Vector2(600,610),false)
		game._process(2)
		check(game.play.ball_at == frozen,"Interrupted ball remains frozen while paused.")
		game.toggle_pause()
		game._unhandled_input(touch_drag(Vector2(600,610)))
		send_touch(game,Vector2(600,610),false)
		game._process(0.1)
		check(not game.play.carrying and game.play.ball_at == frozen and game.play.velocity == Vector2.ZERO,"Resume plus stale touch events cannot revive the canceled drag.")
	send_touch(game,game.play.ball_at,true,37)
	game._unhandled_input(touch_drag(Vector2(480,620),37))
	send_touch(game,Vector2(900,600),true,58)
	game._unhandled_input(touch_drag(Vector2(900,600),58))
	send_touch(game,Vector2(900,600),false,58,true)
	check(game.play.carrying and game.play.ball_at == Vector2(480,620),"Nonzero primary contact remains owned when another finger is canceled.")
	send_touch(game,Vector2(480,620),false,37)
	check(game.play.velocity.x > 0 and not game.play.carrying,"Fresh nonzero touch release still throws after interruptions.")
	send_touch(game,game.play.ball_at,true,37)
	game._unhandled_input(touch_drag(Vector2(440,620),37))
	game.play.web_touch_canceled([71])
	check(game.play.carrying and game.play.throw_velocity.x < 0,"Browser cancellation of an unrelated GUI identifier cannot release the controlling ball touch.")
	game.play.web_touch_canceled([37])
	send_touch(game,Vector2(440,620),false,37)
	check(not game.play.carrying and game.play.velocity == Vector2.ZERO and game.play.throw_velocity == Vector2.ZERO,"Browser cancellation of the actual ball identifier clears the drag before its ordinary engine release.")
	send_touch(game,game.play.ball_at,true,37)
	game._unhandled_input(touch_drag(Vector2(450,620),37))
	send_touch(game,Vector2(450,620),false,37,true)
	check(not game.play.carrying and game.play.velocity == Vector2.ZERO and game.play.throw_velocity == Vector2.ZERO,"Nonzero native primary cancellation clears the held ball.")
	send_touch(game,game.play.ball_at,true)
	game._unhandled_input(touch_drag(Vector2(430,610)))
	game.toggle_toy()
	game._unhandled_input(touch_drag(Vector2(600,610)))
	send_touch(game,Vector2(600,610),false)
	check(not game.play.active() and not game.play.carrying and game.play.velocity == Vector2.ZERO and game.play.throw_velocity == Vector2.ZERO,"Putting away a held ball cancels the drag and cannot throw on late release.")
	check(game.bowl.visible and game.baby_mess.visible and game.grooming.visible and game.bathing.visible and game.baby.position.is_equal_approx(pose),"Putting away restores care props and the original pose.")
	check(care_snapshot(game) == care,"Touch ball play and interruptions preserve food, water, grooming, dirt, floor mess and keepsakes.")
	game.toggle_toy()
	send_touch(game,Vector2(600,610),false)
	check(not game.play.carrying and game.play.ball_at == Vector2(360,630) and game.play.velocity == Vector2.ZERO,"Reopening the ball starts clean after a held put-away.")
	game.toggle_toy()
	game.reset_scene()

func run_checks() -> void:
	var game = load("res://scenes/courtyard.tscn").instantiate()
	root.add_child(game)
	game.set_process(false)
	game.muted = true
	touch_checks(game)
	ball_touch_checks(game)
	game.cleanup.spawn(game.NEAR_BOWL)
	game.baby_mess.mark_dirty()
	game.grooming.tufts[0].ruffle = 0.35
	game.cup.water = 2
	var dirt: float = game.baby_mess.spots[0].remaining
	var patches: int = game.cleanup.patches.size()
	var saved_stickers: Dictionary = game.album.store.placed.duplicate(true)
	game.bowl.eat_one()
	var snacks_left: int = game.bowl.pieces
	var bowl_at: Vector2 = game.bowl.position
	game.handle_at(key(KEY_N),Vector2.ZERO)
	check(game.play.mode == "nap" and game.state == "nap","N starts the physical nap activity.")
	check(not game.bowl.visible and game.bowl.pieces == snacks_left,"Starting a nap puts the food away without eating or discarding it.")
	game.handle_at(key(KEY_C),Vector2.ZERO)
	game._process(4)
	check(not game.play.sleeping and game.play.settling == 0,"Cheek contact alone cannot skip tucking in.")
	game.handle_at(key(KEY_C,false),Vector2.ZERO)
	game.handle_at(mouse(true),game.play.BLANKET_HOME)
	game.handle_at(move(),Vector2(400,250))
	game.handle_at(mouse(false),Vector2(400,250))
	check(not game.play.blanketed and game.play.blanket_at == game.play.BLANKET_HOME,"Invalid blanket drop returns it, with no penalty.")
	game.handle_at(mouse(true),game.play.BLANKET_HOME)
	game.handle_at(move(),Vector2(780,520))
	game.handle_at(mouse(false),Vector2(780,520))
	check(game.play.blanketed,"A real mouse drag tucks the blanket over its back.")
	game._process(5)
	check(game.play.nap_body.visible and not game.baby.visible,"Tucking replaces the standing rig with the complete curled illustration.")
	check(game.play.nap_body.texture == game.play.NAP_ART,"Naps use a dedicated pose, not a compressed idle sprite.")
	check(not game.baby_mess.visible and not game.grooming.visible,"Standing-pose overlays do not float over the sleeping drawing.")
	var sleeping_cheek: Vector2 = game.play.cheek()
	check(sleeping_cheek.y > game.CHEEK.y+40,"Cheek contact follows the lowered head.")
	check(not game.play.sleeping,"The blanket does not auto-complete settling.")
	game.handle_at(mouse(true),game.play.cheek())
	game._process(1)
	var settled_before: float = game.play.settling
	game.toggle_pause()
	game._process(5)
	check(game.play.settling == settled_before,"Pause freezes settling.")
	check(not game.play.contact and not game.cleanup.is_processing(),"Pause releases contact without restarting care.")
	game.toggle_pause()
	check(not game.cleanup.is_processing(),"Resume keeps the nap's care simulations frozen.")
	game.handle_at(key(KEY_C),Vector2.ZERO)
	game._process(3)
	check(game.play.sleeping and game.baby.texture == game.REST_ART,"Gentle contact visibly settles the baby to sleep.")
	game.handle_at(key(KEY_C,false),Vector2.ZERO)
	game._process(60)
	check(game.play.sleeping and not game.hud.visible,"Sleep is quiet and does not expire or trigger demands.")
	check(not game.bowl.visible,"The food stays put away through tucking, pause and sleep.")
	game.handle_at(key(KEY_F),Vector2.ZERO)
	game.toggle_cloud()
	check(game.play.sleeping and not game.flight.active and game.state == "nap","Sleep cannot be interrupted by feeding or flight.")
	game.handle_at(mouse(true),game.play.cheek())
	check(game.play.waking and not game.play.sleeping and game.state == "nap","Cheek waking begins a gentle stretch before standing care.")
	check(not game.bowl.visible and not game.baby_mess.is_processing(),"Care remains frozen during the wake-up beat.")
	game.handle_at(mouse(false),game.play.cheek())
	game._process(0.55)
	check(game.play.wake_body.visible and game.play.wake_body.texture == game.play.WAKE_ART and game.play.wake_body.modulate.a == 1,"The attached, windbreaker-clad quadruped visibly yawns and stretches.")
	var wake_before: float = game.play.wake_time
	game.toggle_pause()
	game._process(5)
	check(game.play.wake_time == wake_before,"Pause freezes waking without completing it.")
	game.toggle_pause()
	game.toggle_case()
	check(not game.album.opened and game.play.wake_time == wake_before,"The case cannot interrupt waking or lose its saved care state.")
	game.handle_at(key(KEY_C),Vector2.ZERO)
	game.handle_at(key(KEY_ENTER),Vector2.ZERO)
	check(not game.play.key_contact and game.play.waking,"Settling and tucking cannot restart during waking.")
	game._process(0.8)
	check(game.baby.visible and game.play.wake_body.visible,"The stretch eases back into the attached standing rig.")
	game._process(0.5)
	check(not game.play.active() and game.state == "idle","A gentle cheek touch wakes it and restores care.")
	check(not game.play.nap_body.visible and not game.play.wake_body.visible and game.baby.visible and game.baby.modulate.a == 1,"Waking restores the original body and its attached paw.")
	check(game.baby_mess.visible and game.grooming.visible and game.bathing.visible,"Waking restores visible care layers without clearing them.")
	check(game.bowl.visible and game.bowl.pieces == snacks_left and game.bowl.position.is_equal_approx(bowl_at),"Waking returns the bowl with the same remaining snack and placement.")
	check(game.cleanup.patches.size() == patches and game.baby_mess.spots[0].remaining == dirt,"Napping preserves floor and baby mess independently.")
	check(game.grooming.tufts[0].ruffle == 0.35 and game.cup.water == 2,"Napping does not erase hygiene progress or water.")
	check(game.album.store.placed == saved_stickers,"Napping does not alter cassette keepsakes.")
	# Skip at early, held and returning poses; saved hidden layers stay hidden.
	var layers: Array = [game.bowl,game.cleanup,game.baby_mess,game.grooming,game.bathing]
	var floor_before: Array = game.cleanup.patches.duplicate(true)
	var baby_before: Array = game.baby_mess.spots.duplicate(true)
	var food_before: Array = game.cleanup.foods.duplicate(true)
	for interruption in ["N","Esc","cheek","toy"]:
		for layer in layers:
			layer.visible = layers.find(layer)%2 == 0
			layer.set_process(layers.find(layer)%2 == 0)
		var original_at: Vector2 = game.baby.position
		var original_scale: Vector2 = game.baby.scale
		var original_color: Color = game.baby.modulate
		begin_wake(game)
		game._process(0.05 if interruption == "N" else (1.4 if interruption == "cheek" else 0.6))
		check(game.play.waking,"N starts the sleepy wake-up from the tucked pose.")
		match interruption:
			"N": game.handle_at(key(KEY_N),Vector2.ZERO)
			"Esc": game.handle_at(key(KEY_ESCAPE),Vector2.ZERO)
			"cheek": game.handle_at(mouse(true),game.play.cheek())
			"toy":
				game.toggle_toy()
				check(game.play.mode == "toy" and not game.play.waking,"Switching to toy play safely interrupts waking.")
				game.play.stop()
		check(not game.play.active() and not game.play.waking,"Waking can be skipped with "+interruption+".")
		check(game.baby.position.is_equal_approx(original_at) and game.baby.scale.is_equal_approx(original_scale) and game.baby.modulate == original_color,"Skipping restores the saved standing transform and opacity.")
		for layer in layers:
			check(layer.visible == (layers.find(layer)%2 == 0) and layer.is_processing() == (layers.find(layer)%2 == 0),"Waking restores each layer's saved visibility and processing, including hidden layers.")
		check(game.cleanup.patches == floor_before and game.cleanup.foods == food_before and game.baby_mess.spots == baby_before,"Skipping leaves all existing floor and baby mess unchanged.")
		game.play.advance(4)
		check(game.state == "idle" and not game.play.wake_body.visible,"Interrupted waking has no late callback to overwrite care.")
	for layer in layers:
		layer.show()
		layer.set_process(true)
	begin_wake(game)
	game._process(0.6)
	game.handle_at(key(KEY_R),Vector2.ZERO)
	check(not game.play.active() and not game.play.waking and not game.play.wake_body.visible and game.bowl.visible,"Reset during a stretch clears the transient pose safely.")
	# Restore the deliberately messy fixture after the explicit scene reset.
	game.cleanup.spawn(game.NEAR_BOWL)
	game.baby_mess.mark_dirty()
	game.cup.water = 2
	dirt = game.baby_mess.spots[0].remaining
	patches = game.cleanup.patches.size()
	game.handle_at(key(KEY_N),Vector2.ZERO)
	game.handle_at(key(KEY_ENTER),Vector2.ZERO)
	check(game.play.blanketed,"Enter gives a keyboard alternative to blanket dragging.")
	game.handle_at(key(KEY_ESCAPE),Vector2.ZERO)
	var pose: Vector2 = game.baby.position
	game.handle_at(key(KEY_L),Vector2.ZERO)
	check(game.play.mode == "toy","L starts toy play.")
	game.handle_at(mouse(true),game.play.ball_at)
	game.handle_at(move(),Vector2(430,620))
	game.handle_at(mouse(false),Vector2(430,620))
	check(game.play.ball_at.x == 430 and not game.play.carrying and absf(game.play.velocity.x) > 0,"Dragging and releasing the ball gives it real rolling motion.")
	for i in 240:
		game._process(0.05)
	check(game.play.boops > 0,"The baby actually follows and bats the ball.")
	check(game.play.ball_at.x >= 345 and game.play.ball_at.x <= 965,"Ball motion stays within the courtyard.")
	game.handle_at(key(KEY_RIGHT),Vector2.ZERO)
	game._process(0.1)
	game.toggle_pause()
	var ball_before: Vector2 = game.play.ball_at
	game._process(2)
	check(game.play.ball_at == ball_before and game.play.held.is_empty(),"Pause freezes the ball and releases held steering.")
	game.toggle_pause()
	game.handle_at(key(KEY_ESCAPE),Vector2.ZERO)
	check(not game.play.active() and game.baby.position.is_equal_approx(pose) and game.baby.scale.x > 0,"Putting the toy away restores pose and facing.")
	check(game.cleanup.patches.size() == patches and game.baby_mess.spots[0].remaining == dirt and game.cup.water == 2,"Toy play preserves the care circuit.")
	game.bowl.spill()
	game.toggle_nap()
	check(not game.bowl.visible,"A tipped empty bowl is also put away for a nap.")
	game.toggle_nap()
	check(game.bowl.visible and game.bowl.spilled and game.bowl.pieces == 0 and not game.bowl.full,"Waking never refills a previously spilled bowl.")
	game.start_cuddle()
	check(not game.play.start("toy"),"Quiet affection cannot be interrupted by a toy.")
	game.reset_scene()
	game.toggle_toy()
	game.handle_at(key(KEY_R),Vector2.ZERO)
	check(not game.play.active() and game.state == "idle","Reset clears transient play safely.")
	game.toggle_nap()
	game.handle_at(key(KEY_R),Vector2.ZERO)
	check(not game.play.active() and game.bowl.visible and game.bowl.full,"Reset during a nap restores the bowl for the fresh care scene.")
	game.queue_free()
	if failures.is_empty():
		print("Qilin nap and toy checks: PASS")
		quit(0)
	else:
		for failure in failures: printerr("FAIL: "+failure)
		quit(1)
