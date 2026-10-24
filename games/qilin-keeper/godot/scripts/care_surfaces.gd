extends RefCounted
## Resolve visible surfaces from the illustrated sprite alpha, not broad circles.

var body: Sprite2D
var paw_art: Sprite2D
var images: Dictionary = {}

func sprite_covers(art: Sprite2D, at: Vector2) -> bool:
	if not is_instance_valid(art) or art.texture == null:
		return false
	return local_sprite_covers(art,art.to_local(at))

func local_sprite_covers(art: Sprite2D, local: Vector2) -> bool:
	if not images.has(art.texture):
		var image := art.texture.get_image()
		if image.is_compressed():
			image.decompress()
		images[art.texture] = image
	var image: Image = images[art.texture]
	var pixel := local - art.offset
	if art.centered:
		pixel += Vector2(image.get_size()) * 0.5
	if pixel.x < 0 or pixel.y < 0 or pixel.x >= image.get_width() or pixel.y >= image.get_height():
		return false
	return image.get_pixel(int(pixel.x),int(pixel.y)).a > 0.1

func hits_baby(at: Vector2) -> bool:
	return sprite_covers(body,at) or sprite_covers(paw_art,at)

func fur_contact_distance(from: Vector2, to: Vector2, target: Vector2, reach: float) -> float:
	# Fur anchors are only mane/tail. A foreground paw cannot be washed through.
	return contact_distance(from,to,target,reach,true,true)

func paw_sweep_covers(at: Vector2) -> bool:
	var limb := paw_art.get_parent() as Node2D
	for angle in [-0.8,-0.6,-0.45,-0.2,0.0,0.22]:
		var pose := body.global_transform * Transform2D(angle,limb.position) * paw_art.transform
		if local_sprite_covers(paw_art,pose.affine_inverse() * at):
			return true
	return false

func clear_floor_footprint(at: Vector2, radius: Vector2) -> bool:
	for offset in [Vector2.ZERO,Vector2(-1,0),Vector2(1,0),Vector2(0,-1),Vector2(0,1),
			Vector2(-0.7,-0.7),Vector2(0.7,-0.7),Vector2(-0.7,0.7),Vector2(0.7,0.7)]:
		var sample: Vector2 = at + offset * radius
		if hits_baby(sample) or paw_sweep_covers(sample):
			return false
	return true

func floor_point(at: Vector2, radius: Vector2) -> Vector2:
	var requested := Vector2(clampf(at.x,110,1170),clampf(at.y,555,675))
	if clear_floor_footprint(requested,radius):
		return requested
	var nearest := INF
	var best := requested
	# Relocate hidden debris onto nearby visible floor, not onto the pet.
	for y in range(555,676,20):
		for x in range(110,1171,24):
			var candidate := Vector2(x,y)
			var distance := candidate.distance_squared_to(requested)
			if distance < nearest and clear_floor_footprint(candidate,radius):
				nearest = distance
				best = candidate
	return best

func contact_distance(from: Vector2, to: Vector2, target: Vector2, reach: float, on_baby: bool, exclude_paw := false) -> float:
	var length := from.distance_to(to)
	if length < 1:
		return 0.0
	var steps := maxi(1,int(ceil(length/6.0)))
	var distance := 0.0
	for i in steps:
		var a := from.lerp(to,float(i)/steps)
		var b := from.lerp(to,float(i+1)/steps)
		var touch := Geometry2D.get_closest_point_to_segment(target,a,b)
		if touch.distance_to(target) >= reach:
			continue
		# A brush must contact the visible surface; it cannot reach through a paw.
		if hits_baby(a) != on_baby or hits_baby(b) != on_baby or hits_baby(touch) != on_baby:
			continue
		if exclude_paw and (sprite_covers(paw_art,a) or sprite_covers(paw_art,b) or sprite_covers(paw_art,touch)):
			continue
		distance += a.distance_to(b)
	return minf(distance,40.0)
