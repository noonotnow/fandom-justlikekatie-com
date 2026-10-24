extends SceneTree

var failures: Array[String] = []

func check(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)

func button(pressed: bool) -> InputEventMouseButton:
	var event := InputEventMouseButton.new()
	event.button_index = MOUSE_BUTTON_LEFT
	event.pressed = pressed
	return event

func rub(game: Node2D, center: Vector2, repeats := 8) -> void:
	var motion := InputEventMouseMotion.new()
	for i in repeats:
		game.handle_care_input_at(motion,center+Vector2(-10 if i%2 else 10,0))

func finish_stage(game: Node2D, kind: int) -> void:
	var tool: Node2D = game.bathing
	game.handle_care_input_at(button(true),tool.HOMES[kind])
	check(tool.selected == kind and tool.scrubbing,"Pickup must continue directly into use.")
	for i in tool.patches.size():
		rub(game,tool.point(i),12)
	game.handle_care_input_at(button(false),tool.point(5))

func _initialize() -> void:
	call_deferred("run_checks")

func run_checks() -> void:
	var game = load("res://scenes/courtyard.tscn").instantiate()
	root.add_child(game)
	game.set_process(false)
	for node in [game.bathing,game.grooming,game.cleanup,game.baby_mess]:
		node.set_process(false)
	var tool: Node2D = game.bathing
	check(not tool.complete() and tool.patches.size() == 6,"Both mane and tail start ready for bathing.")
	game.cleanup.spawn(game.NEAR_BOWL)
	var floor_before: int = game.cleanup.patches.size()
	var dirt_before: float = game.baby_mess.spots[0].remaining
	game.handle_care_input_at(button(true),game.grooming.TRAY)
	game.handle_care_input_at(button(false),game.grooming.TRAY)
	game.handle_care_input_at(button(true),tool.HOMES[0])
	check(tool.selected == 0 and not game.grooming.selected,"Physical bath pickup must return the brush.")
	var first: Vector2 = tool.point(0)
	rub(game,first,1)
	check(float(tool.patches[0].wash) > 0 and tool.startled > 0,"Continuous pickup gesture starts lather and a mild water reaction.")
	var before: float = tool.patches[0].wash
	tool.stroke(tool.pointer,tool.pointer)
	check(tool.patches[0].wash == before,"Stationary hold must not wash magically.")
	game.handle_care_input_at(button(false),first)
	rub(game,first)
	check(tool.patches[0].wash == before,"Mouse release must stop washing.")
	game.handle_care_input_at(button(true),tool.HOMES[1])
	rub(game,first)
	check(not tool.finished_stage("rinse"),"Rinse cannot skip washing.")
	game.handle_care_input_at(button(true),tool.HOMES[2])
	rub(game,first)
	check(not tool.complete(),"Dry cannot skip rinsing.")
	game.handle_care_input_at(button(true),tool.HOMES[0])
	before = tool.patches[0].wash
	for at in [Vector2(750,535),Vector2(540,440),game.paw.palm_position(),Vector2(300,660)]:
		rub(game,at)
	check(tool.patches[0].wash == before,"Jacket, face, paw and floor must not wash the mane.")
	var palm: Vector2 = game.paw.palm_position()
	check(game.care_surfaces.fur_contact_distance(palm-Vector2(8,0),palm+Vector2(8,0),palm,30) == 0,"Fur tools cannot target through the moving paw.")
	game.handle_care_input_at(button(false),tool.pointer)
	# Same sponge is already equipped; begin at fur rather than toggle its tray.
	game.handle_care_input_at(button(true),first)
	for i in 3:
		rub(game,tool.point(i),12)
	check(not tool.finished_stage("wash"),"Washing the mane alone must leave the tail to do.")
	for i in range(3,6):
		rub(game,tool.point(i),12)
	check(tool.finished_stage("wash") and not tool.finished_stage("rinse"),"Lather is distinct from rinsed fur.")
	game.handle_care_input_at(button(false),tool.pointer)
	finish_stage(game,1)
	check(tool.finished_stage("rinse") and not tool.complete(),"Rinsing removes lather but leaves damp fur.")
	finish_stage(game,2)
	check(tool.complete() and tool.quiet_time == 5 and tool.huff_requested,"Drying completes visible care with a quiet rest and huff.")
	check(game.cleanup.patches.size() == floor_before and game.baby_mess.spots[0].remaining == dirt_before,"Bathing never clears accidental baby or floor residue.")
	for tuft in game.grooming.tufts:
		check(float(tuft.ruffle) == 1,"Bathing must not silently complete or undo brushing.")
	tool.content = 0
	game.handle_care_input_at(button(true),first)
	rub(game,first)
	check(tool.complete() and tool.content > 0,"Finished towel strokes become affection.")
	game.toggle_pause()
	check(tool.selected == -1 and not tool.scrubbing and tool.complete() and not tool.is_processing(),"Pause returns tools, stops input and preserves completed care.")
	game.toggle_pause()
	game.handle_care_input_at(button(true),tool.HOMES[0])
	game.handle_care_input_at(button(true),game.cleanup.CLOTH_HOME)
	check(tool.selected == -1 and game.cleanup.cloth_selected,"Physical cloth pickup replaces the bath tool.")
	game.cleanup.foods.clear()
	game.handle_care_input_at(button(true),tool.HOMES[1])
	game.handle_care_input_at(button(true),game.cleanup.MOP_HOME)
	check(tool.selected == -1 and game.cleanup.mop_selected,"Physical mop pickup replaces the bath tool.")
	game.handle_care_input_at(button(true),tool.HOMES[2])
	game.handle_care_input_at(button(true),game.grooming.TRAY)
	check(tool.selected == -1 and game.grooming.selected and not game.cleanup.active(),"Physical brush pickup replaces all other tools.")
	game.equip_bath(1)
	game.start_cuddle()
	check(tool.selected == -1 and tool.complete() and game.state == "cuddle","Cuddling is unconditional and preserves bathing.")
	game.end_cuddle()
	game.equip_bath(0)
	game.start_feeding()
	check(tool.selected == -1 and tool.complete() and game.state == "feeding","Feeding returns bath tools without erasing care.")
	game.reset_scene()
	check(not tool.complete() and not tool.water_seen and tool.selected == -1 and not tool.scrubbing,"Reset restores the full routine and returns tools.")
	for keycode in [KEY_S,KEY_E,KEY_D]:
		var key := InputEventKey.new()
		key.pressed = true
		key.keycode = keycode
		game._unhandled_input(key)
		check(tool.selected == [KEY_S,KEY_E,KEY_D].find(keycode),"Each bath shortcut must select its distinct tool.")
	var escape := InputEventKey.new()
	escape.pressed = true
	escape.keycode = KEY_ESCAPE
	game._unhandled_input(escape)
	check(tool.selected == -1 and not tool.scrubbing,"Escape safely returns a keyboard-selected tool.")
	game.equip_bath(0)
	game.handle_care_input_at(button(true),first)
	rub(game,first,2)
	var partial: float = tool.patches[0].wash
	game.toggle_pause()
	game.toggle_pause()
	check(partial > 0 and tool.patches[0].wash == partial and tool.selected == -1,"Pause preserves partial lather without keeping the mouse held.")
	game.start_cuddle()
	check(game.state == "cuddle" and tool.patches[0].wash == partial,"Affection is available even mid-bath.")
	game.reset_scene()
	check(float(tool.patches[0].wash) == 0 and not tool.huff_requested,"Reset removes partial lather and pending completion feedback.")
	if failures.is_empty():
		print("Qilin bathing checks: PASS")
		quit(0)
	else:
		for failure in failures:
			push_error(failure)
		quit(1)
