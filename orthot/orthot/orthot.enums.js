// Various enumerations

// Enumeration representing the different types of collisions between pairs of objects
// For now, the only major use of Collision classification is by the movement engine when determining how to resolve collisions
orthot.collision = {
	NONE:0,			        //no collision
	SIMPLE:1,		      	//an object striking a stationary object
	NEAR_RAM:2,	      	//Two adjacent objects move toward each other and collide
	FAR_RAM:3,		      //Two objects with one space separating move toward each other and collide
	CORNER_RAM:4,	      //Two diagonally adjacent objects moving toward the same destination
	EDGE_RAM:5,		      //One object striking an adjacent object which is moving away from destination in a perpendicular direction
	CHASE:6,			      //One object following another.

	FAKE:7,			        //not really a collision.  This is just used to put generic callbacks into contingent movement
	
	PRIORITY_RAM:9,     //Upgraded FAR_RAM - occurs when a FAR_RAM opponent has movement priority over the contested destination
	PRIORITY_STEAL:10,  //degenerate CORNER_RAM - occurs when a CORNER_RAM opponent has movement priority over the contested destination
	                    //    This is also similar to EDGE_RAM (the target object is moving into the destination instead of out)
}

orthot.gatestate = {
  RETRACTED:0,
  RETRACTING:1,
  EXTENDED:2,
  EXTENDING:3,
}

orthot.state = {
  IDLE:0,
  WALKING:1,
  FALLING:2,
  SLIDING:3,
  DEFEATED:4,
  PICKEDUP:5,
  MAYBEFALL:6,
  PANIC:7
}

// Force-strength values.  Enumerated with large values because this should be closely related to composite stresses (weight/tension).
orthot.strength = {
  NONE:            0,
  LIGHT:        5000,
  NORMAL:      25000,
  HARD:       100000,
  CRUSHING:  1000000
}





