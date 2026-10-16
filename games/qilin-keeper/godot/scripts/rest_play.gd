extends Node2D
## Physical play and settling, connected to session-only care. No scores/deadlines.

const MAT = preload("res://assets/nap-mat.svg")
const FOLDED = preload("res://assets/nap-blanket-folded.svg")
const QUILT = preload("res://assets/nap-blanket-curled.svg")
const NAP_ART = preload("res://assets/qilin-curled-nap.png")
const WAKE_ART = preload("res://assets/qilin-wake-stretch.png")
const WAKE_DURATION := 1.8
const REDUCED_WAKE_DURATION := 0.35
const BALL = preload("res://assets/toy-ball.svg")
const BLANKET_HOME := Vector2(1110,620)
const BACK := Rect2(635,445,300,155)
const BALL_BOUNDS := Rect2(345,590,620,65)
const NAP_FLOOR := Vector2(400,665)
const NAP_WIDTH := 600.0
const NAP_CHEEK := Vector2(0.35,0.68)

var host: Node2D
var front: Node2D
var nap_body: Sprite2D
var wake_body: Sprite2D
var waking := false
var wake_time := 0.0
var wake_duration := WAKE_DURATION
var pose_mix := 0.0
var mode := ""
var blanketed := false
var sleeping := false
var settling := 0.0
var contact := false
var key_contact := false
var carrying := false
var blanket_at := BLANKET_HOME
var ball_at := Vector2(360,630)
var velocity := Vector2.ZERO
var throw_velocity := Vector2.ZERO
var ball_turn := 0.0
var held: Dictionary = {}
var pointer_offset := Vector2.ZERO
var last_motion_ms := 0
var boops := 0
var cooldown := 0.0
var tap_time := 0.0
var phase := 0.0
var saved_pose: Dictionary = {}
var saved_nodes: Array[Dictionary] = []
var web_focus_callback: JavaScriptObject
var web_cancel_callback: JavaScriptObject
var toy_touch_index := -1
var web_focus_gained_callback: JavaScriptObject
var play_response := ""

func _ready() -> void:
	host = get_parent()
	nap_body = Sprite2D.new()
	nap_body.texture = NAP_ART
	nap_body.centered = false
	nap_body.offset = Vector2(0,-NAP_ART.get_height())
	nap_body.z_index = 1
	nap_body.hide()
	add_child(nap_body)
	wake_body = Sprite2D.new()
	wake_body.texture = WAKE_ART
	wake_body.centered = false
	wake_body.offset = Vector2(0,-WAKE_ART.get_height())
	wake_body.z_index = 1
	wake_body.hide()
	add_child(wake_body)
	front = Node2D.new()
	front.z_index = 4
	add_child(front)
	front.draw.connect(draw_front)
	get_window().size_changed.connect(_on_window_resized)
	if OS.has_feature("web"):
		# Keep the callback alive. Web canvas/window blur does not reliably
		# produce APPLICATION_FOCUS_OUT in Godot 4.4.
		web_focus_callback = JavaScriptBridge.create_callback(web_focus_lost)
		web_focus_gained_callback = JavaScriptBridge.create_callback(web_focus_gained)
		web_cancel_callback = JavaScriptBridge.create_callback(web_touch_canceled)
		var browser := JavaScriptBridge.get_interface("window")
		browser.__qilinOnRestFocusLost = web_focus_callback
		browser.__qilinOnRestFocusGained = web_focus_gained_callback
		browser.__qilinOnRestTouchCanceled = web_cancel_callback
		# Godot 4.4's web input maps touchcancel to an ordinary released
		# ScreenTouch. Cancel directly before the engine listener runs.
		# Match cancellation to the contact accepted by ball play, not the
		# window's first contact: GUI touches may never reach this node.
		JavaScriptBridge.eval("""
			if (!window.__qilinTouchCancelInstalled) {
				window.__qilinTouchCancelInstalled = true;
				window.addEventListener('touchcancel', function(event) {
					Array.from(event.changedTouches).forEach(function(touch) {
						window.__qilinOnRestTouchCanceled(touch.identifier);
					});
				}, true);
				window.addEventListener('blur', function() {
					window.__qilinOnRestFocusLost();
				}, true);
				window.addEventListener('focus', function() {
					window.__qilinOnRestFocusGained();
				}, true);
				document.addEventListener('visibilitychange', function() {
					if (document.hidden) window.__qilinOnRestFocusLost();
					else if (document.hasFocus()) window.__qilinOnRestFocusGained();
				});
			}
		""")

func web_focus_lost(_args: Array) -> void:
	host.care_focus_changed(false)

func web_focus_gained(_args: Array) -> void:
	host.care_focus_changed(true)

func _on_window_resized() -> void:
	# Rotation/fullscreen changes the screen-to-courtyard mapping mid-gesture.
	# Treat it as cancellation, never as a blanket drop or a new cheek press.
	# Keep this nap-only; ball interruption behavior is handled separately.
	if mode == "nap":
		release_input()
		queue_redraw()
		front.queue_redraw()

func web_touch_canceled(args: Array) -> void:
	var canceled_id := int(args[0])
	if mode == "toy" and toy_touch_index == canceled_id:
		release_input()
	elif mode == "nap" and canceled_id == 0:
		release_input()

func active() -> bool:
	return not mode.is_empty()

func start(kind: String) -> bool:
	if kind not in ["nap","toy"] or host.paused or host.album.opened:
		return false
	if host.flight.active:
		host.status = "Land in the courtyard before napping or playing ball."
		return false
	if host.state in ["feeding","drinking","cuddle"] or host.grooming.quiet_time > 0 or host.bathing.quiet_time > 0:
		host.status = "Let the bite, sips, or little huff finish first."
		return false
	if sleeping:
		host.status = "Wake gently with N or a cheek touch before playing."
		return false
	if active():
		stop()
	host.cancel_cup()
	host.cleanup.cancel_interaction()
	host.grooming.cancel()
	host.bathing.cancel()
	host.cleanup.feedback = ""
	host.grooming.feedback = ""
	host.bathing.feedback = ""
	host.dragging = false
	host.mouse_held = false
	host.cuddle_held = false
	host.high_five = false
	host.hand.amount = 0
	saved_pose = {"position":host.baby.position,"scale":host.baby.scale,"rotation":host.baby.rotation,"visible":host.baby.visible,"modulate":host.baby.modulate}
	saved_nodes.clear()
	for node in [host.bowl,host.cleanup,host.baby_mess,host.grooming,host.bathing]:
		saved_nodes.append({"node":node,"processing":node.is_processing(),"visible":node.visible})
		node.set_process(false)
	mode = kind
	if mode == "nap":
		host.bowl.hide()
	host.state = kind
	host.state_time = 0
	blanketed = false
	sleeping = false
	waking = false
	wake_time = 0
	settling = 0
	pose_mix = 0
	nap_body.hide()
	wake_body.hide()
	blanket_at = BLANKET_HOME
	ball_at = Vector2(360,630)
	velocity = Vector2.ZERO
	ball_turn = 0
	boops = 0
	cooldown = 0
	tap_time = 0
	phase = 0
	play_response = ""
	release_input()
	host.nap_button.text = "Wake / N" if kind == "nap" else "Nap / N"
	host.toy_button.text = "Put away / L" if kind == "toy" else "Ball / L"
	host.status = "Snack bowl put away. Bring the folded blanket to its back." if kind == "nap" else "A star ball. Roll it toward the baby; it has opinions."
	advance(0)
	return true

func release_input() -> void:
	if carrying:
		velocity = Vector2.ZERO
	contact = false
	key_contact = false
	carrying = false
	held.clear()
	throw_velocity = Vector2.ZERO
	toy_touch_index = -1
	if mode == "nap" and not blanketed:
		blanket_at = BLANKET_HOME
	update_browser_probe()

func stop() -> void:
	if not active():
		return
	var was_nap := mode == "nap"
	mode = ""
	nap_body.hide()
	wake_body.hide()
	waking = false
	wake_time = 0
	release_input()
	for entry in saved_nodes:
		entry.node.set_process(bool(entry.processing) and not host.paused)
		entry.node.visible = entry.visible
	saved_nodes.clear()
	host.baby.position = saved_pose.position
	host.baby.scale = saved_pose.scale
	host.baby.rotation = saved_pose.rotation
	host.baby.texture = host.IDLE_ART
	host.baby.visible = saved_pose.visible
	host.baby.modulate = saved_pose.modulate
	host.paw.position = host.ARM_HOME
	host.paw.rotation = -0.45
	host.paw.amount = 0
	host.hand.amount = 0
	host.state = "idle"
	host.state_time = 0
	host.next_gesture = host.elapsed+12
	host.ui_alpha = 1
	host.hud.show()
	host.hud.modulate.a = 1
	host.nap_button.text = "Nap / N"
	host.toy_button.text = "Ball / L"
	host.status = "Sleepy blink. Still your baby." if was_nap else "Ball put away. All the care and affection are still here."
	sleeping = false
	queue_redraw()
	front.queue_redraw()
	update_browser_probe()

func wake() -> void:
	if mode != "nap":
		return
	if waking or not blanketed or pose_mix < 0.5:
		stop()
		return
	# A delta-driven beat, not a deferred tween: stop/reset cannot leave callbacks
	# that later overwrite care state. Switching activities also skips it safely.
	sleeping = false
	waking = true
	wake_time = 0
	# Capture this visual duration once so toggling mid-wake cannot rewind it.
	wake_duration = REDUCED_WAKE_DURATION if host.reduced_motion else WAKE_DURATION
	release_input()
	host.hand.amount = 0
	host.ui_alpha = 1
	host.hud.show()
	host.hud.modulate.a = 1
	host.status = "A little yawn, a sleepy stretch. Still your baby."
	host.nap_button.text = "Care / N"
	advance(0)

func tuck() -> void:
	if mode != "nap" or sleeping or waking:
		return
	blanketed = true
	carrying = false
	nap_body.show()
	# Standing-rig overlays have no valid anchors on the separate curled drawing.
	# Hide them, never erase the underlying dirt or grooming state.
	host.baby_mess.hide()
	host.grooming.hide()
	host.bathing.hide()
	host.status = "Tucked in. Hold its cheek gently, or hold C. No rush."

func cheek() -> Vector2:
	if waking:
		return wake_body.to_global(WAKE_ART.get_size()*NAP_CHEEK+wake_body.offset)
	if mode == "nap" and blanketed and pose_mix >= 0.5:
		return nap_body.to_global(NAP_ART.get_size()*NAP_CHEEK+nap_body.offset)
	return host.baby.to_global((host.CHEEK-host.HOME)/0.62)

func hint() -> String:
	if mode == "toy":
		return "Drag/release: roll. Arrows / Space: offer. C: cuddle. N: nap. L / Esc: put away."
	if waking:
		return "A sleepy stretch. Cheek touch / N / Esc: return to care whenever you like."
	if sleeping:
		return "Sleeping. Click its cheek or press N to wake gently."
	return "Blanket to back / Enter: tuck. Hold cheek / C: settle. N / Esc: finish."

func advance(delta: float) -> void:
	if not active() or host.paused or host.focus_suspended or host.album.opened:
		update_browser_probe()
		return
	phase += delta
	host.paw.position = host.ARM_HOME
	if mode == "nap" and waking:
		host.care.awake(delta)
		advance_wake(delta)
		if not active():
			return
	elif mode == "nap":
		var visual_delta := delta * (4.0 if host.reduced_motion else 1.0)
		var sleeping_seconds := delta if sleeping else 0.0
		if blanketed and (contact or key_contact) and not sleeping:
			sleeping_seconds = maxf(0,delta-(3.0-settling))
			settling = minf(3.0,settling+delta)
			if settling >= 3-0.000001:
				settling = 3
				sleeping = true
				contact = false
				key_contact = false
				host.status = "Sleeping. No demands. Wake gently whenever you like."
				host.play_sound(host.HUFF)
		host.care.awake(delta-sleeping_seconds)
		host.care.sleep_for(sleeping_seconds)
		host.baby.texture = host.REST_ART if settling > 0.25 else host.IDLE_ART
		host.baby.position = host.baby.position.lerp(host.HOME+Vector2(-18,24),minf(visual_delta*2,1))
		var breath := sin(phase*1.3)*0.005*(0.15 if host.reduced_motion else 1.0)
		host.baby.scale = Vector2(0.62+breath,0.62-breath)
		host.baby.rotation = lerp_angle(host.baby.rotation,-0.045,minf(visual_delta*2,1))
		if blanketed:
			pose_mix = move_toward(pose_mix,1,visual_delta*3)
			host.baby.modulate.a = (1-pose_mix)*float(saved_pose.modulate.a)
			host.baby.visible = pose_mix < 1
			nap_body.modulate.a = pose_mix
			nap_body.position = NAP_FLOOR+Vector2(0,-18*(1-pose_mix))
			var size := NAP_WIDTH/float(NAP_ART.get_width())
			nap_body.scale = Vector2(size,size*(1+breath))
			# Its eyes rest before sleep; the body visibly gives its weight to
			# the held cheek. Keep the complete curled anatomy together.
			var softness := smoothstep(0,3,settling)
			nap_body.rotation = lerpf(-0.025,0,softness)
			nap_body.position.y -= 10*(1-softness)
			if not sleeping and (contact or key_contact):
				host.status = "It leans into your hand. Its paws loosen; its weight settles. Keep holding gently."
		host.paw.rotation = lerp_angle(host.paw.rotation,-0.45,minf(delta*3,1))
		host.paw.amount = 0
		host.hand.position = cheek()+Vector2(-9,29)
		host.hand.amount = move_toward(host.hand.amount,1 if (contact or key_contact) and not sleeping else 0,delta*2)
		var quiet := sleeping or (blanketed and settling > 0.5 and (contact or key_contact))
		host.ui_alpha = move_toward(host.ui_alpha,0 if quiet else 1,delta*2)
	else:
		host.care.awake(delta)
		var willing: bool = host.care.wants_play()
		var response: String = "" if willing else host.care.play_response()
		if response != play_response:
			host.status = response if not response.is_empty() else "A curious look at the star ball. Ready for another gentle roll."
			play_response = response
		cooldown = maxf(0,cooldown-delta)
		tap_time = maxf(0,tap_time-delta)
		if not carrying:
			if not held.is_empty():
				velocity.x = 235*(int(held.has(KEY_RIGHT))-int(held.has(KEY_LEFT)))
			var before := ball_at.x
			ball_at.x += velocity.x*delta
			if ball_at.x < BALL_BOUNDS.position.x or ball_at.x > BALL_BOUNDS.end.x:
				ball_at.x = clampf(ball_at.x,BALL_BOUNDS.position.x,BALL_BOUNDS.end.x)
				velocity.x *= -0.65
			ball_turn += (ball_at.x-before)/36
			velocity.x = move_toward(velocity.x,0,delta*130)
		var facing := 1.0 if ball_at.x > host.baby.position.x else -1.0
		var target_x := clampf(ball_at.x-facing*236,510,795)
		var walking: bool = willing and absf(target_x-host.baby.position.x) > 6
		if willing:
			host.baby.position.x = move_toward(host.baby.position.x,target_x,delta*145)
		# Evaluate contact in the original full-motion pose for either preference.
		# Decorative bounce must not change the forgiving paw hit area or boop timing.
		host.baby.position.y = host.HOME.y-absf(sin(phase*7))*7 if walking else host.HOME.y
		host.baby.scale = Vector2(-0.62 if facing > 0 else 0.62,0.62)
		host.baby.rotation = 0
		host.baby.texture = host.REST_ART if tap_time > 0 or host.care.tired() else host.IDLE_ART
		host.paw.rotation = -0.45+0.15*sin(tap_time*10) if tap_time > 0 else -0.45
		if willing and not carrying and cooldown <= 0 and host.paw.palm_position().distance_to(ball_at) < 58:
			velocity.x = facing*240
			tap_time = 0.7
			cooldown = 2.5
			boops += 1
			host.care.bat_ball()
			host.status = "Tiny paw. Big sporting opinions. Roll it back?"
			host.play_sound(host.HUFF)
		if host.reduced_motion:
			host.baby.position.y = lerpf(host.HOME.y,host.baby.position.y,0.15)
			host.paw.rotation = lerpf(-0.45,host.paw.rotation,0.15)
		host.ui_alpha = 1
	host.hud.modulate.a = host.ui_alpha
	host.hud.visible = host.ui_alpha > 0.02
	host.status_label.text = host.status
	host.helper.text = hint()
	queue_redraw()
	front.queue_redraw()
	update_browser_probe()

func update_browser_probe() -> void:
	# Opt-in, read-only state for real browser touch regression checks.
	if not OS.has_feature("web") or not JavaScriptBridge.eval("window.__qilinProbe === true"):
		return
	var dirt: Array = []
	for spot in host.baby_mess.spots:
		dirt.append(spot.remaining)
	var at := cheek()
	var screen := get_viewport().get_screen_transform()
	var care := {"snacks":host.bowl.pieces,"spilled":host.bowl.spilled,"water":host.cup.water,"grooming":host.grooming.tufts,"bathing":host.bathing.patches,"keepsakes":host.album.store.placed}
	var snapshot := {"mode":mode,"blanketed":blanketed,"sleeping":sleeping,"settling":settling,"contact":contact,"carrying":carrying,"blanket":{"x":blanket_at.x,"y":blanket_at.y},"paused":host.paused,"pose_mix":pose_mix,"cheek":{"x":at.x,"y":at.y},"screen":{"x":screen.origin.x,"y":screen.origin.y,"scale_x":screen.x.x,"scale_y":screen.y.y},"care":care,"dirt":dirt,"patches":host.cleanup.patches.size(),"overlays":[host.baby_mess.visible,host.grooming.visible,host.bathing.visible]}
	snapshot["ball"] = {"x":ball_at.x,"y":ball_at.y,"velocity":velocity.x,"throw_velocity":throw_velocity.x,"turn":ball_turn,"baby_x":host.baby.position.x,"boops":boops,"touch_index":toy_touch_index}
	snapshot["needs"] = host.care.snapshot()
	var ruffles: Array = []
	for tuft in host.grooming.tufts:
		ruffles.append(tuft.ruffle)
	care["dirt"] = dirt
	care["patches"] = host.cleanup.patches.size()
	care["ruffles"] = ruffles
	care["stickers"] = host.album.store.placed
	JavaScriptBridge.eval("window.__qilinRestProbe = "+JSON.stringify(snapshot))

func advance_wake(delta: float) -> void:
	wake_time = minf(wake_time+delta,wake_duration)
	if wake_time >= wake_duration:
		stop()
		return
	var visual_time := wake_time/wake_duration*WAKE_DURATION
	var unfold := smoothstep(0,0.3,visual_time)
	var rise := smoothstep(1.05,WAKE_DURATION,visual_time)
	var stretch := sin(PI*clampf(visual_time/1.35,0,1))*(0.15 if wake_duration == REDUCED_WAKE_DURATION else 1.0)
	var size := NAP_WIDTH/float(WAKE_ART.get_width())
	# Move the complete illustrated quadruped together; no independently floating
	# paws, head, jacket or tail. Keep its paws close to the mat throughout.
	wake_body.position = NAP_FLOOR+Vector2(-8*stretch,-4*stretch)
	wake_body.scale = Vector2(size*(1+0.025*stretch),size)
	wake_body.modulate.a = unfold*(1-rise)
	wake_body.visible = true
	nap_body.modulate.a = (1-unfold)*(1-rise)
	host.baby.texture = host.REST_ART
	host.baby.position = (host.HOME+Vector2(-18,24)).lerp(saved_pose.position,rise)
	host.baby.scale = saved_pose.scale
	host.baby.rotation = lerp_angle(-0.045,float(saved_pose.rotation),rise)
	host.baby.modulate = saved_pose.modulate
	host.baby.modulate.a *= rise
	host.baby.visible = rise > 0 and bool(saved_pose.visible)
	host.paw.amount = 0
	host.hand.amount = 0
	host.ui_alpha = 1

func handle_at(event: InputEvent, at: Vector2) -> bool:
	if not active():
		return false
	if event is InputEventKey:
		if event.echo:
			return true
		if event.keycode == KEY_C:
			if mode == "toy" and event.pressed:
				stop()
				host.cuddle_held = true
				host.start_cuddle()
				return true
			key_contact = event.pressed and mode == "nap" and blanketed and not sleeping and not waking
			if OS.has_feature("web") and JavaScriptBridge.eval("window.__qilinProbe === true"):
				print("Nap contact: pressed=",event.pressed," settling=",settling," phase=",phase," sleeping=",sleeping)
		if event.keycode in [KEY_LEFT,KEY_RIGHT]:
			if event.pressed: held[event.keycode] = true
			else: held.erase(event.keycode)
		if event.pressed:
			match event.keycode:
				KEY_N: host.toggle_nap()
				KEY_L: host.toggle_toy()
				KEY_ESCAPE: stop()
				KEY_ENTER: tuck()
				KEY_SPACE:
					if mode == "toy":
						velocity.x = 270*signf(host.baby.position.x-ball_at.x)
		return true
	if (event is InputEventMouseButton or event is InputEventMouseMotion) and event.device < 0:
		return true
	if event is InputEventScreenTouch or event is InputEventScreenDrag:
		if mode == "toy":
			# Own the first contact, not the literal identifier 0. Browsers
			# may use a new, nonzero identifier for each phone gesture.
			if event is InputEventScreenTouch and event.pressed and not event.canceled and toy_touch_index < 0:
				toy_touch_index = event.index
			if event.index != toy_touch_index:
				return true
		elif event.index != 0:
			return true
	if event is InputEventScreenTouch and event.canceled:
		# A browser/system interruption is neither a blanket drop nor a ball throw.
		release_input()
		return true
	var press: bool = (event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed) or (event is InputEventScreenTouch and event.pressed)
	var release: bool = (event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and not event.pressed) or (event is InputEventScreenTouch and not event.pressed)
	var motion := event is InputEventMouseMotion or event is InputEventScreenDrag
	if press:
		if mode == "nap":
			if waking and at.distance_to(cheek()) < 110:
				stop()
			elif sleeping and at.distance_to(cheek()) < 110:
				wake()
			elif not blanketed and at.distance_to(blanket_at) < 90:
				carrying = true
				pointer_offset = blanket_at-at
			elif blanketed and not waking and at.distance_to(cheek()) < 110:
				contact = true
		elif at.distance_to(ball_at) < 55:
			carrying = true
			pointer_offset = ball_at-at
			last_motion_ms = Time.get_ticks_msec()
			throw_velocity = Vector2.ZERO
			velocity = Vector2.ZERO
	if motion:
		if mode == "nap":
			if carrying: blanket_at = at+pointer_offset
			if contact and at.distance_to(cheek()) > 110: contact = false
		elif carrying:
			var next := Vector2(clampf(at.x+pointer_offset.x,BALL_BOUNDS.position.x,BALL_BOUNDS.end.x),clampf(at.y+pointer_offset.y,BALL_BOUNDS.position.y,BALL_BOUNDS.end.y))
			var seconds := maxf((Time.get_ticks_msec()-last_motion_ms)/1000.0,0.016)
			throw_velocity = (next-ball_at)/seconds
			ball_turn += (next.x-ball_at.x)/36
			ball_at = next
			last_motion_ms = Time.get_ticks_msec()
	if release:
		contact = false
		if carrying:
			if mode == "nap":
				if BACK.has_point(blanket_at): tuck()
				else:
					blanket_at = BLANKET_HOME
					host.status = "The blanket goes over its back, not its face."
			else:
				velocity.x = clampf(throw_velocity.x*0.6,-360,360)
			carrying = false
		if event is InputEventScreenTouch:
			toy_touch_index = -1
	queue_redraw()
	front.queue_redraw()
	return true

func _draw() -> void:
	if mode == "nap":
		draw_texture_rect(MAT,Rect2(340,550,780,150),false)

func draw_front() -> void:
	if mode == "nap":
		if blanketed:
			front.draw_set_transform(Vector2(980,650),0,Vector2(1,1+sin(phase*1.3)*0.005))
			var quilt_alpha := pose_mix*(1-smoothstep(0,0.45,wake_time)) if waking else pose_mix
			front.draw_texture_rect(QUILT,Rect2(-360,-290,360,290),false,Color(1,1,1,quilt_alpha))
			front.draw_set_transform(Vector2.ZERO)
		else:
			front.draw_texture_rect(FOLDED,Rect2(blanket_at-Vector2(65,42),Vector2(130,84)),false)
	elif mode == "toy":
		front.draw_set_transform(ball_at+Vector2(0,31),0,Vector2(1,0.3))
		front.draw_circle(Vector2.ZERO,33,Color(0.15,0.06,0.25,0.18))
		front.draw_set_transform(ball_at,ball_turn)
		front.draw_texture_rect(BALL,Rect2(-36,-36,72,72),false)
		front.draw_set_transform(Vector2.ZERO)
