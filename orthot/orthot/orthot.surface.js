orthot.surface = {

  // surface types.  These are paired up [between adjacent objects] to determine how the objects interact
  type:{
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
  },
    
  // surface interaction.  This basically is the amount of friction between a pair of surfaces.  These values are used to determine if a force is strong enough
  //  to push an object, whether or not momentum is retained, and whether or not stacked objects remain stacked when lower objects are pushed
  //  There was at some point, a plan to do something more sophisticated, but this simplified model seems best for keeping puzzles logic-based
  //    (rather than physics-based or physics-abuse-based)
  interaction:{
    SLIDE:0,      // No resistance - any push will do, and the object will continue moving
    RESIST:1,     // minor resistance - standard push is sufficient to overcome.  At this and lower levels, no riding will take place
    DRAG:2,       // moderate resistance - standard push is sufficient to overcome, but at this and higher levels, objects will will ride
    IMPEDE:3,     // major resistance - standard push is quite insufficient.  
    BLOCK:4,      // Need crushing force to move - which also may be sufficient to destroy
  },

  //lookup the interaction between a pair of surface types.
  //  This mostly is for preventing combinatorial explosions.  
  interact:( function() {
    let interact_tbl = [ 
      [ 0, 0,0,0,0, 0,0,0, 0,0,0 ],
      
      [ 0, 0,0,0,1, 1,3,0, 0,0,0 ],
      [ 0, 0,1,1,1, 0,2,1, 1,1,1 ],
      [ 0, 0,1,2,2, 1,3,1, 1,1,1 ],
      [ 0, 1,2,2,3, 3,4,1, 1,1,1 ],
      
      [ 0, 1,0,1,3, 3,4,2, 1,1,1 ],
      [ 0, 3,2,3,4, 4,2,3, 3,3,3 ],
      [ 0, 0,1,1,1, 2,3,3, 1,1,1 ],
      
      [ 0, 0,1,1,1, 1,3,1, 1,2,2 ],
      [ 0, 0,1,1,1, 1,3,1, 2,0,3 ],
      [ 0, 0,1,1,1, 1,3,1, 2,3,0 ],
    ]
    
    return function(sfc, other_sfc) {
      return interact_tbl[sfc][other_sfc]
      //if (interaction == undefined) {
      //  return orthot.surface.Interaction.SLIDE
      //}
    }
  })(),
}























