# Colliders and sizes

An entity's solid body is a box (or sphere) centred on its `Transform`. Its box size is its **Scale**, times twice the Collider's `halfExtents` (0.5 each by default, which is the Scale itself).

- **A catalog model with no `Scale` component** is drawn at the model's own size, and (since 0.92.0) its body is that size too. Before this, placing a model (Catalog > Add) and adding a Collider made a 1 m cube at its centre, so the player walked through a building it was looking at. Give the entity a `Scale` to make it any size you like; the model is stretched to match and so is the body.
- A Collider on a **child** entity does nothing (children ride with their parent); put the Collider on the parent.
- Everything solid blocks the Player and cars (`Collider.isTrigger` off): walls stop you, a car's roof or a crate can be jumped onto (up to `CharacterController.jumpHeight`) and stepped over up to `stepHeight`.
- One box per entity: a car is one box, as high as the car. Shape a hood or a stair out of several box entities.
