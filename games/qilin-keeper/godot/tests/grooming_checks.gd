extends SceneTree

var failures: Array[String] = []

func check(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)

func mouse_button(pressed: bool) -> InputEventMouseButton:
	var event := InputEventMouseButton.new()
	event.button_index = MOUSE_BUTTON_LEFT
	event.pressed = pressed
	return event

func brush_forward(game: Node2D, index: int) -> void:
	var tool: Node2D = game.grooming
	var center: Vector2 = tool.point(index)
	var direction: Vector2 = (game.baby.to_global(tool.DIRECTION)-game.baby.to_global(Vector2.ZERO)).normalized()
	for i in range(10):
		tool.handle_at(mouse_button(false),center+direction*18)
		tool.handle_at(mouse_button(true),center-direction*18)
		var motion := InputEventMouseMotion.new()
		tool.handle_at(motion,center+direction*18)

func _initialize() -> void:
	call_deferred("run_checks")

func run_checks() -> void:
	var scene = load("res://scenes/courtyard.tscn").instantiate()
	root.add_child(scene)
	scene.set_process(false)
	var tool: Node2D = scene.grooming
	tool.set_process(false)
	scene.cleanup.set_process(false)
	scene.baby_mess.set_process(false)
	check(tool.tufts.size() == 6 and not tool.groomed(),"Both mane and tail start visibly ruffled.")
	scene.baby_mess.mark_dirty()
	scene.cleanup.spawn(scene.NEAR_BOWL)
	var floor_before: int = scene.cleanup.patches.size()
	var dirt_before: float = scene.baby_mess.spots[0].remaining
	check(tool.handle_at(mouse_button(true),tool.TRAY),"Physical brush pickup must consume the click.")
	check(tool.selected and tool.scrubbing,"One pickup gesture must immediately support dragging.")
	check(not scene.cleanup.active(),"Brush pickup must return other held tools.")
	var first: Vector2 = tool.point(0)
	var direction: Vector2 = tool.DIRECTION.normalized()
	tool.pointer = first-direction*18
	tool.stroke(first-direction*18,first+direction*18)
	var after_good: float = tool.tufts[0].ruffle
	check(after_good < 1,"Following the fur must visibly settle a tuft.")
	check(tool.tufts[1].ruffle == after_good and tool.tufts[2].ruffle == after_good,"A stroke anywhere in the mane must groom its whole region.")
	tool.stroke(first+direction*18,first-direction*18)
	check(float(tool.tufts[0].ruffle) > after_good and tool.offended > 0,"Brushing against fur must ruffle it with a mild reaction.")
	var stationary: float = tool.tufts[0].ruffle
	tool.stroke(first,first)
	check(tool.tufts[0].ruffle == stationary,"Holding still must not groom magically.")
	for i in range(3):
		brush_forward(scene,i)
	check(not tool.groomed(),"Finishing the mane must leave the tail to groom.")
	for i in range(3,6):
		brush_forward(scene,i)
	check(tool.groomed(),"Valid strokes must finish both mane and tail.")
	check(tool.quiet_time >= 5 and tool.huff_requested,"Finished grooming must allow the quiet affectionate shot and huff.")
	check(scene.cleanup.patches.size() == floor_before,"Grooming must not remove floor mess.")
	check(scene.baby_mess.spots[0].remaining == dirt_before,"Grooming must not wash sticky paws.")
	tool.content = 0
	tool.stroke(first+direction*18,first-direction*18)
	check(tool.groomed() and tool.content > 0,"After grooming, extra brushing is affection, not more work.")
	scene.toggle_pause()
	check(not tool.selected and tool.groomed() and not tool.is_processing(),"Pause returns the brush but preserves grooming.")
	scene.toggle_pause()
	scene.equip_brush()
	scene.start_cuddle()
	check(not tool.selected and tool.groomed(),"Cuddling remains available without losing grooming.")
	scene.reset_scene()
	check(not tool.groomed() and not tool.selected,"Reset restores ruffled fur and returns the brush.")
	scene.equip_brush()
	var key := InputEventKey.new()
	key.keycode = KEY_W
	key.pressed = true
	scene.baby_mess.mark_dirty()
	scene._unhandled_input(key)
	check(not tool.selected and scene.cleanup.cloth_selected,"Keyboard tool switching must be mutually exclusive.")
	scene.equip_brush()
	scene.start_feeding()
	check(not tool.selected and scene.state == "feeding","Feeding must return the brush safely.")
	scene.reset_scene()
	scene.equip_brush()
	tool.scrubbing = true
	for center in [Vector2(575,270),Vector2(887,286)]:
		for i in range(4):
			tool.stroke(center+Vector2(-16,22),center+Vector2(16,-22))
			tool.stroke(center+Vector2(16,-22),center+Vector2(-16,22))
	check(tool.groomed(),"Ordinary back-and-forth strokes across the two fur regions must complete grooming.")
	scene.reset_scene()
	tool.handle_at(mouse_button(true),tool.TRAY)
	tool.handle_at(mouse_button(false),tool.TRAY)
	check(tool.selected and not tool.scrubbing,"Click-and-release pickup keeps the brush in hand.")
	var hover_motion := InputEventMouseMotion.new()
	for center in [Vector2(575,270),Vector2(887,286)]:
		tool.handle_at(hover_motion,center+Vector2(-16,22))
		for i in range(4):
			tool.handle_at(hover_motion,center+Vector2(16,-22))
			tool.handle_at(hover_motion,center+Vector2(-16,22))
	check(tool.groomed(),"A carried brush must groom on mouse movement without a held button.")
	if failures.is_empty():
		print("Qilin grooming checks: PASS")
		quit(0)
	else:
		for failure in failures:
			push_error(failure)
		quit(1)
