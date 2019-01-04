// Various enumerations

// Enumeration representing the different types of collisions between pairs of objects
// For now, the only major use of Collision classification is by the movement engine when determining how to resolve collisions
orthot.Collision = {
	NONE:0,			        //no collision
	SIMPLE:1,		      	//an object striking a stationary object
	NEAR_RAM:2,	      	//Two adjacent objects move toward each other and collide
	FAR_RAM:3,		      //Two objects with one space separating move toward each other and collide
	CORNER_RAM:4,	      //Two diagonally adjacent objects moving toward the same destination
	EDGE_RAM:5,		      //One object striking an adjacent object which is moving in a perpendicular direction
	CHASE:6,			      //One object following another.

	FAKE:7,			        //not really a collision.  This is just used to put generic callbacks into contingent movement
	
	PRIORITY_RAM:9,     //Upgraded FAR_RAM - occurs when a FAR_RAM opponent has movement priority over the contested destination
	PRIORITY_STEAL:10,   //Side-graded CORNER_RAM - occurs when a CORNER_RAM opponent has movement priority over the contested destination
}

orthot.ObjectState = {
  IDLE:0,
  WALKING:1,
  FALLING:2,
  SLIDING:3,
  DEFEATED:4,
  PICKEDUP:5,
  MAYBEFALL:6
}

// Force-strength values.  Enumerated with large values because this should be closely related to composite stresses (weight/tension).
orthot.Strength = {
  NONE:            0,
  LIGHT:        5000,
  NORMAL:      25000,
  HARD:       100000,
  CRUSHING:  1000000
}

// Various types of surfaces.  One of the first 
orthot.SurfaceType = {
  FRICTIONLESS:0,
  SLICK:1,
  SMOOTH:2,
  ROUGH:3,  
  COARSE:4,
  
  SOFT:5,
  STICKY:6,  
  ELASTIC:7,
  
  METALLIC:8,  
  MAGNETIC_NEGATIVE:9,
  MAGNETIC_POSITIVE:10,
}