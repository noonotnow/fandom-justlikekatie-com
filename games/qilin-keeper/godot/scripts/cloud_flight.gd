extends Node2D
## A separate, forgiving play activity. Care state stays on the ground.

const CLOUD_ART = preload("res://assets/cloud-ride.svg")
const SHADES_ART = preload("res://assets/square-shades.svg")
const BOUNDS := Rect2(260,310,750,100)
const SPEED := 245.0
const TAKEOFF_DURATION := 0.9
const REDUCED_TAKEOFF_DURATION := 0.2

var active := false
var host: Node2D
var cloud: Sprite2D
var shades: Sprite2D
var pilot := Vector2(660,365)
var velocity := Vector2.ZERO
var phase := 0.0
var takeoff_duration := TAKEOFF_DURATION
var pointer_held := false
var pointer_target := Vector2.ZERO
var held_keys: Dictionary = {}
var saved_nodes: Array[Dictionary] = []
var saved_pose: Dictionary = {}
var trail: Array[Vector2] = []
var trail_wait := 0.0

func _ready() -> void:
	host = get_parent()
	cloud = Sprite2D.new()
	cloud.texture = CLOUD_ART
	cloud.scale = Vector2.ONE * 0.52
	cloud.visible = false
	add_child(cloud)
	shades = Sprite2D.new()
	shades.texture = SHADES_ART
	shades.z_index = 8
	shades.visible = false
	host.baby.add_child(shades)

func start() -> bool:
	if active or host.paused:
		return false
	if host.state == "feeding" or host.state == "cuddle":
		host.status = "Let the bite or cuddle finish, then take a cloud ride."
		return false
	host.cancel_cup()
	host.cleanup.cancel_interaction()
	host.grooming.cancel()
	host.bathing.cancel()
	host.dragging = false
	host.mouse_held = false
	host.cuddle_held = false
	host.high_five = false
	host.glance_active = false
	saved_pose = {"position":host.baby.position,"scale":host.baby.scale,"rotation":host.baby.rotation}
	saved_nodes.clear()
	for node in [host.bowl,host.cup,host.snack,host.hand,host.cleanup,host.baby_mess,host.grooming,host.bathing]:
		saved_nodes.append({"node":node,"visible":node.visible,"process":node.is_processing()})
		node.hide()
		node.set_process(false)
	host.state = "flight"
	host.state_time = 0
	host.baby.texture = host.IDLE_ART
	host.paw.position = host.ARM_HOME
	host.paw.amount = 1
	active = true
	pilot = Vector2(660,365)
	velocity = Vector2.ZERO
	phase = 0
	# Capture the visual duration; changing preferences cannot rewind takeoff.
	takeoff_duration = REDUCED_TAKEOFF_DURATION if host.reduced_motion else TAKEOFF_DURATION
	trail.clear()
	trail_wait = 0
	release_input()
	cloud.show()
	shades.show()
	host.flight_button.text = "Land / Y"
	host.status = "LOW ALTITUDE. HIGH CONFIDENCE."
	host.hud.show()
	host.hud.modulate.a = 1
	advance(0)
	return true

func land(remember: bool = true) -> void:
	if not active:
		return
	active = false
	release_input()
	cloud.hide()
	shades.hide()
	for entry in saved_nodes:
		entry.node.visible = entry.visible
		entry.node.set_process(bool(entry.process) and not host.paused)
	saved_nodes.clear()
	host.baby.position = saved_pose.position
	host.baby.scale = saved_pose.scale
	host.baby.rotation = saved_pose.rotation
	host.baby.texture = host.IDLE_ART
	host.paw.amount = 0
	host.paw.rotation = -0.45
	host.state = "idle"
	host.state_time = 0
	host.next_gesture = host.elapsed + 12
	host.ui_alpha = 1
	host.hud.show()
	host.hud.modulate.a = 1
	host.flight_button.text = "Cloud ride / Y"
	host.status = "Back in the courtyard. Same baby; all its care is still here."
	host.status_label.text = host.status
	host.helper.text = "Paused. P to resume." if host.paused else "Bowl: feed / F. Moon cup: drink / J. Y: another cloud ride."
	if remember and phase >= 0.9 and host.album != null:
		host.album.award("first_landing")
	queue_redraw()
	host.queue_redraw()

func release_input() -> void:
	held_keys.clear()
	pointer_held = false
	velocity = Vector2.ZERO

func clamp_target(at: Vector2) -> Vector2:
	return Vector2(clampf(at.x,BOUNDS.position.x,BOUNDS.end.x),clampf(at.y,BOUNDS.position.y,BOUNDS.end.y))

func handle_at(event: InputEvent, at: Vector2) -> void:
	if event is InputEventKey:
		if event.pressed and not event.echo and event.keycode in [KEY_Y,KEY_ESCAPE]:
			land()
			return
		if event.keycode in [KEY_LEFT,KEY_RIGHT,KEY_UP,KEY_DOWN]:
			held_keys[event.keycode] = event.pressed
	if host.paused:
		return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		pointer_held = event.pressed
		pointer_target = clamp_target(at)
	if event is InputEventMouseMotion and pointer_held:
		pointer_target = clamp_target(at)
	if event is InputEventScreenTouch:
		pointer_held = event.pressed
		pointer_target = clamp_target(at)
	if event is InputEventScreenDrag:
		pointer_target = clamp_target(at)

func advance(delta: float) -> void:
	if not active or host.paused:
		return
	phase += delta
	if phase >= 0.9 and host.album != null:
		host.album.award("first_flight")
	var direction := Vector2(float(held_keys.get(KEY_RIGHT,false))-float(held_keys.get(KEY_LEFT,false)),
		float(held_keys.get(KEY_DOWN,false))-float(held_keys.get(KEY_UP,false)))
	if pointer_held:
		var difference := pointer_target-pilot
		direction = difference.normalized()*minf(difference.length()/70,1)
	elif direction.length() > 1:
		direction = direction.normalized()
	velocity = velocity.lerp(direction*SPEED,minf(delta*5,1))
	pilot = clamp_target(pilot+velocity*delta)
	var motion_amount := 0.15 if host.reduced_motion else 1.0
	var takeoff := smoothstep(0,1,minf(phase/takeoff_duration,1))
	var bob := Vector2(sin(phase*0.7)*7,sin(phase*1.8)*6)*motion_amount
	host.baby.position = Vector2(saved_pose.position).lerp(pilot+bob,takeoff)
	var breathing := sin(phase*2)*0.003*motion_amount
	host.baby.scale = Vector2(saved_pose.scale).lerp(Vector2(0.47+breathing,0.47-breathing),takeoff)
	host.baby.rotation = lerp_angle(host.baby.rotation,clampf(velocity.x/SPEED,-1,1)*0.075*motion_amount,minf(delta*4,1))
	host.paw.rotation = -0.09+sin(phase*1.4)*0.035*motion_amount
	cloud.position = host.baby.to_global(Vector2(22,407))+Vector2(0,17)
	cloud.rotation = host.baby.rotation*0.45
	cloud.modulate.a = 0.4+takeoff*0.6
	trail_wait += delta
	if host.reduced_motion:
		# Clear old puffs too when the preference changes during a ride.
		trail.clear()
	elif trail_wait >= 0.15 and velocity.length() > 12:
		trail_wait = 0
		trail.push_front(cloud.position-velocity.normalized()*160)
		if trail.size() > 8:
			trail.pop_back()
	queue_redraw()

func _draw() -> void:
	if not active:
		return
	# The ground shadow stays below the cloud instead of travelling up with it.
	var radius := lerpf(150,205,(pilot.y-BOUNDS.position.y)/BOUNDS.size.y)
	draw_set_transform(Vector2(host.baby.position.x+25,682),0,Vector2(radius,15))
	draw_circle(Vector2.ZERO,1,Color(0.25,0.12,0.37,0.13))
	draw_set_transform(Vector2.ZERO)
	for i in range(trail.size()):
		var opacity := 0.22*(1-float(i)/8)
		draw_circle(trail[i],15-float(i),Color(0.95,0.9,1,opacity))
