extends SceneTree
## Cheap native regression checks; run with --headless --script.

var failures := 0

func check(condition: bool, message: String) -> void:
	if not condition:
		failures += 1
		push_error(message)

func _initialize() -> void:
	call_deferred("run_checks")

func run_checks() -> void:
	var game = load("res://scenes/courtyard.tscn").instantiate()
	root.add_child(game)
	game.set_process(false)
	# Headless checks should not start audio playback threads during manual stepping.
	game.muted = true
	check(game.paw.get_parent() == game.baby, "Forepaw must inherit the character's body transform.")
	check(game.paw.position == game.ARM_HOME, "Forepaw must remain at its shoulder anchor.")
	for texture in [game.IDLE_ART, game.REST_ART, game.BITE_ART]:
		var image: Image = texture.get_image()
		if image.is_compressed():
			image.decompress()
		for eye in [Vector2i(185, 451), Vector2i(210, 478), Vector2i(321, 443), Vector2i(379, 475)]:
			check(image.get_pixelv(eye).a > 0.99, "Eyes must be opaque in every expression.")
		check(image.get_pixel(0, 0).a == 0.0, "Background should remain transparent.")
	# Same gesture with a bowl in reach spills, even after a high-five.
	game.raise_paw()
	game.meet_paw()
	game._process(1.7)
	game._process(0.3)
	check(not game.bowl.full, "Nearby bowl should spill.")
	check(game.high_five, "Spilling must not cancel the high-five.")
	# Spilled bowl must not prevent quiet affection.
	game.start_cuddle()
	game._process(0.4)
	check(game.baby.texture == game.REST_ART, "Cuddle should use closed-eye expression.")
	game.released_cuddle = true
	game._process(1.0)
	check(game.state == "cuddle", "Quiet moment must finish even on early release.")
	game._process(3.7)
	check(game.state == "idle", "Released cuddle should finish after the protected interval.")
	# The same tell in a different prop situation preserves bowl and high-five.
	game.reset_scene()
	game.bowl.position = game.SAFE_BOWL
	game.raise_paw()
	game.meet_paw()
	game._process(1.7)
	game._process(0.3)
	check(game.bowl.full, "Relocated bowl must survive.")
	check(game.high_five, "Saving the bowl must preserve affection.")
	# Quiet moments must not trigger the next demand.
	game.start_cuddle()
	game._process(15.0)
	check(game.state == "cuddle", "Held affection must not be interrupted.")
	check(game.ui_alpha == 0.0, "No demand HUD should appear during affection.")
	# Pause must not advance scene time.
	game.reset_scene()
	game.toggle_pause()
	var before: float = game.elapsed
	game._process(10.0)
	check(game.elapsed == before, "Pause should stop game time.")
	check(game.bowl.full, "Pause must not spill the bowl.")
	game.reset_scene()
	check(game.bowl.full and game.state == "idle" and not game.paused, "Reset should restore playable state.")
	# Actual keyboard and drag input paths.
	var key := InputEventKey.new()
	key.keycode = KEY_B
	key.pressed = true
	game._unhandled_input(key)
	check(game.bowl.position == game.SAFE_BOWL, "B must relocate the bowl.")
	game.bowl.spill()
	game.bowl.refill()
	check(game.bowl.full and not game.bowl.spilled, "Refill should restore the bowl.")
	# Releasing a lifted bowl at the mouth triggers actual feeding.
	game.reset_scene()
	game.dragging = true
	game.bowl.position = game.MOUTH
	game.finish_bowl_drag()
	check(game.state == "feeding", "Bowl dropped at the mouth must start feeding.")
	game._process(0.35)
	check(game.baby.texture == game.BITE_ART, "Mouth must open as the food approaches.")
	game._process(0.2)
	check(game.bowl.pieces == 2, "First bite must consume food at the open mouth.")
	game._process(0.2)
	check(game.baby.texture == game.IDLE_ART, "Mouth must close for chewing.")
	game._process(0.3)
	for i in 2:
		game._process(0.6)
		check(game.bowl.pieces == 1-i, "Each visible bite must consume one moonpear.")
		game._process(0.5)
	check(not game.bowl.full and not game.bowl.spilled, "Eaten bowl must be empty, not spilled.")
	check(game.state == "idle", "Feeding must return to normal play.")
	check(not game.snack.visible, "Eaten food must not linger on screen.")
	game.bowl.refill()
	key.keycode = KEY_F
	game._unhandled_input(key)
	check(game.state == "idle" and game.bowl.pieces == 3 and game.care_signals.refusal > 0, "A full baby must decline F without eating the refilled bowl.")
	game.reset_scene()
	game._unhandled_input(key)
	check(game.state == "feeding", "F must provide accessible feeding when hungry.")
	game.reset_scene()
	game.start_cuddle()
	game.start_feeding()
	check(game.state == "cuddle", "Feeding must not interrupt quiet affection.")
	game.reset_scene()
	game.raise_paw()
	game._process(1.7)
	game._process(0.3)
	check(game.cleanup.foods.size() == 3 and game.cleanup.patches.size() == 3, "Spill must create physical scraps and sticky residue.")
	check(game.baby.z_index > game.cleanup.z_index, "Floor debris must draw behind the baby and its articulated paw.")
	check(game.snack.z_index > game.baby.z_index and game.hand.z_index > game.baby.z_index, "Feeding and affectionate hand must remain in front of the baby.")
	for patch in game.cleanup.patches:
		check(game.care_surfaces.clear_floor_footprint(patch.at,Vector2(40,25)), "Spills must land on accessible floor, not across the baby's silhouette.")
	var spill_pose: float = game.paw.rotation
	for angle in [-0.8,-0.6,-0.45,-0.2,0.0,0.22]:
		game.paw.rotation = angle
		for patch in game.cleanup.patches:
			check(not game.care_surfaces.hits_baby(patch.at), "Floor targets must remain accessible as the paw changes pose.")
	game.paw.rotation = spill_pose
	var fixed_spill: Vector2 = game.cleanup.foods[0]
	game.bowl.refill()
	game.bowl.position = game.SAFE_BOWL
	check(game.cleanup.foods[0] == fixed_spill and game.cleanup.has_mess(), "Refill and bowl movement must not move or erase a spill.")
	game.cleanup.equip_cloth()
	check(game.cleanup.cloth_selected and game.baby_mess.has_mess(), "Baby cleanup must be available before floor cleanup.")
	game.cleanup.cancel_interaction()
	game.cleanup.equip_mop()
	check(not game.cleanup.mop_selected, "Collect scraps before equipping the floor mop.")
	var mouse := InputEventMouseButton.new()
	mouse.button_index = MOUSE_BUTTON_LEFT
	mouse.pressed = true
	game.cleanup.handle_at(mouse,game.cleanup.foods[0])
	mouse.pressed = false
	game.cleanup.handle_at(mouse,Vector2(300,620))
	check(game.cleanup.foods.size() == 3, "A missed drop must not delete a fallen bite.")
	mouse.pressed = true
	game.cleanup.handle_at(mouse,game.cleanup.foods[0])
	mouse.pressed = false
	game.cleanup.handle_at(mouse,game.cleanup.BIN)
	check(game.cleanup.foods.size() == 2, "Dropping a bite into compost should collect it.")
	key.keycode = KEY_G
	for i in 2:
		game._unhandled_input(key)
		game.cleanup._process(0.4)
	check(game.cleanup.foods.is_empty() and game.cleanup.gathered == 3, "G must collect one bite at a time.")
	mouse.pressed = true
	game.cleanup.handle_at(mouse,game.cleanup.CLOTH_HOME)
	check(game.cleanup.cloth_selected and game.cleanup.scrubbing, "Picking up the cloth must start wiping in the same held drag.")
	var first_patch: Vector2 = game.baby_mess.point("paw")
	var initial_residue: float = game.baby_mess.spots[0].remaining
	var untouched_floor: Array = game.cleanup.patches.duplicate(true)
	var motion := InputEventMouseMotion.new()
	game.cleanup.handle_at(motion,first_patch)
	check(game.baby_mess.spots[0].remaining < initial_residue, "Dragging from the cloth tray onto a sticky paw must wipe it.")
	check(game.cleanup.patches == untouched_floor, "Cloth contact must not clean the floor.")
	mouse.pressed = false
	game.cleanup.handle_at(mouse,first_patch)
	check(not game.cleanup.scrubbing, "Releasing the mouse must stop wiping.")
	game.cleanup.cancel_interaction()
	key.keycode = KEY_W
	game._unhandled_input(key)
	check(game.cleanup.cloth_selected, "W should equip the baby's cloth.")
	game.cleanup.equip_mop()
	check(game.cleanup.mop_selected and not game.cleanup.cloth_selected, "Switching tools must not leave both active.")
	game.cleanup.equip_cloth()
	mouse.pressed = true
	var patch_at: Vector2 = game.baby_mess.point("paw")
	game.cleanup.handle_at(mouse,patch_at)
	var before_wipe: float = game.baby_mess.spots[0].remaining
	game.cleanup.wipe(patch_at,patch_at)
	check(game.baby_mess.spots[0].remaining == before_wipe, "Holding still should not magically wipe the baby.")
	for spot in game.baby_mess.spots.duplicate(true):
		var at: Vector2 = game.baby_mess.point(spot.part)
		for i in 12:
			game.cleanup.wipe(at+Vector2(-18,0),at+Vector2(18,0))
	check(not game.baby_mess.has_mess() and game.cleanup.patches == untouched_floor, "Clean baby must leave floor dirt unchanged.")
	check(not game.cleanup.completed and not game.cleanup.cloth_selected, "Cloth must return without claiming the floor is clean.")
	key.keycode = KEY_V
	game._unhandled_input(key)
	check(game.cleanup.mop_selected, "V must equip the floor mop.")
	mouse.pressed = true
	game.cleanup.handle_at(mouse,game.cleanup.patches[0].at)
	for patch in game.cleanup.patches.duplicate(true):
		var at: Vector2 = patch.at
		for i in 12:
			game.cleanup.wipe(at+Vector2(-18,0),at+Vector2(18,0))
	check(not game.cleanup.has_mess() and game.cleanup.completed, "Both independent jobs must finish before all-clean feedback.")
	check(not game.cleanup.mop_selected, "A finished floor job must return the mop.")
	# Reverse order: clean floor first; the baby must still need its cloth.
	game.cleanup.spawn(game.NEAR_BOWL)
	for i in 3:
		game.cleanup.collect_one()
		game.cleanup._process(0.4)
	mouse.pressed = true
	game.cleanup.handle_at(mouse,game.cleanup.MOP_HOME)
	check(game.cleanup.mop_selected and game.cleanup.scrubbing, "Picking up the mop must start wiping in the same held drag.")
	game.cleanup.handle_at(motion,game.cleanup.patches[0].at)
	check(game.cleanup.patches[0].remaining < 1.0, "Dragging from the mop tray must wipe floor residue.")
	for patch in game.cleanup.patches.duplicate(true):
		var at: Vector2 = patch.at
		for i in 12:
			game.cleanup.wipe(at+Vector2(-18,0),at+Vector2(18,0))
	check(not game.cleanup.has_floor_mess() and game.baby_mess.spots.size() == 2, "Mopping must not clean the baby's sticky paws or muzzle.")
	check(not game.cleanup.completed and game.cleanup.has_mess(), "Clean floor must not claim a clean baby.")
	game.cleanup.equip_cloth()
	game.cleanup.scrubbing = true
	for spot in game.baby_mess.spots.duplicate(true):
		var at: Vector2 = game.baby_mess.point(spot.part)
		for i in 12:
			game.cleanup.wipe(at+Vector2(-18,0),at+Vector2(18,0))
	check(game.cleanup.completed and not game.cleanup.has_mess(), "Both cleanup orders must work.")
	game.cleanup.spawn(game.NEAR_BOWL)
	game.start_cuddle()
	game._process(0.4)
	check(game.state == "cuddle" and game.ui_alpha < 1 and game.cleanup.has_mess(), "Affection must remain available without erasing the mess.")
	game.reset_scene()
	check(not game.cleanup.has_mess() and game.cleanup.gathered == 0 and not game.baby_mess.has_mess(), "Reset must clear baby and floor mess.")
	# Deliberately put floor residue behind an opaque paw: the mop cannot reach through.
	var visible_paw: Vector2 = game.baby_mess.point("paw")
	check(game.care_surfaces.hits_baby(visible_paw), "Surface detection must include the moving paw artwork.")
	game.baby_mess.mark_dirty()
	game.cleanup.patches.append({"at": visible_paw, "remaining": 1.0})
	game.cleanup.equip_mop()
	game.cleanup.scrubbing = true
	for i in 12:
		game.cleanup.wipe(visible_paw+Vector2(-8,0),visible_paw+Vector2(8,0))
	check(game.cleanup.patches[0].remaining == 1.0, "Mopping over an opaque paw must not clean floor residue behind it.")
	check(game.baby_mess.spots[0].remaining == 1.0, "Mopping over a paw must not clean the baby either.")
	check(game.cleanup.feedback.contains("CLOTH"), "Mopping a paw must explain the correct tool.")
	game.reset_scene()
	print("Qilin interaction checks: ", "PASS" if failures == 0 else "FAIL (%d)" % failures)
	game.free()
	call_deferred("quit", 0 if failures == 0 else 1)
