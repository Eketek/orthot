// 

libek.direction = {
  code:{
    UP:1,
    DOWN:2,
    NORTH:3,
    EAST:4,
    SOUTH:5,
    WEST:6,
  },
  name:[ "nodir", "up", "down", "north", "east", "south", "west" ],
  
  // Cartesian vectors to represent each direction
  vector:{
    UP:new THREE.Vector3(0,1,0),
    DOWN:new THREE.Vector3(0,-1,0),
    NORTH:new THREE.Vector3(0,0,1),
    EAST:new THREE.Vector3(-1,0,0),
    SOUTH:new THREE.Vector3(0,0,-1),
    WEST:new THREE.Vector3(1,0,0),
    
    up:new THREE.Vector3(0,1,0),
    down:new THREE.Vector3(0,-1,0),
    north:new THREE.Vector3(0,0,1),
    east:new THREE.Vector3(-1,0,0),
    south:new THREE.Vector3(0,0,-1),
    west:new THREE.Vector3(1,0,0),
    
    1:new THREE.Vector3(0,1,0),
    2:new THREE.Vector3(0,-1,0),
    3:new THREE.Vector3(0,0,1),
    4:new THREE.Vector3(-1,0,0),
    5:new THREE.Vector3(0,0,-1),
    6:new THREE.Vector3(1,0,0),
  },  
  
  opposite:   [0, 2, 1, 5, 6, 3, 4],
  invert:     [0, 2, 1, 5, 6, 3, 4],
  
  cross:(function() {
    let r = [
      0,
      [ 0, 0, 0, 4, 5, 6, 3 ],
      [ 0, 0, 0, 6, 3, 4, 5 ],
      [ 0, 6, 4, 0, 2, 0, 1 ],
      [ 0, 3, 5, 1, 0, 2, 0 ],
      [ 0, 4, 6, 0, 1, 0, 2 ],
      [ 0, 5, 3, 2, 0, 1, 0 ]
    ]
    return function(forward, up) {
      return r[up][forward]
    }
  })(),
    
  //  Rotate a "heading" vector by a relational rotation ("from-to") derived from two sets of basis vectors
  //  This should probably be made somewhat more performant (possibly with a 7776 entry lookup table)
  rotateDirection_bydirections:(function() {
    let vec = new THREE.Vector3()
    return function(fromHEADING, fromFORWARD, fromUP, toFORWARD, toUP) {
      libek.direction.rotateVector_byvectors(
        vec, 
        libek.direction.vector[fromHEADING],
        libek.direction.vector[fromFORWARD],
        libek.direction.vector[fromUP],
        libek.direction.vector[toFORWARD],
        libek.direction.vector[toUP]
      )
      if (vec.x == -1) {
        return libek.direction.code.EAST
      }
      if (vec.x == 1) {
        return libek.direction.code.WEST
      }
      if (vec.y == -1) {
        return libek.direction.code.DOWN
      }
      if (vec.y == 1) {
        return libek.direction.code.UP
      }
      if (vec.z == -1) {
        return libek.direction.code.SOUTH
      }
      if (vec.z == 1) {
        return libek.direction.code.NORTH
      }
    }
  })(),
  
  //  Rotate a "heading" vector by a relational rotation ("from-to") derived from two sets of basis vectors
  rotateVector_byvectors:(function() {
    let mat = new THREE.Matrix4()
    let inv = new THREE.Matrix4()
    let vec = new THREE.Vector3()
    
    return function(out, fromHEADING, fromFORWARD, fromUP, toFORWARD, toUP) {
      if (!fromHEADING.isVector3) {
        fromHEADING = libek.direction.vector[fromHEADING]
      }
      if (!fromFORWARD.isVector3) {
        fromFORWARD = libek.direction.vector[fromFORWARD]
        toFORWARD = libek.direction.vector[toFORWARD]
        fromUP = libek.direction.vector[fromUP]
        toUP = libek.direction.vector[toUP]
      }
      
      vec.crossVectors(fromUP, fromFORWARD)
      mat.makeBasis(vec, fromUP, fromFORWARD)
      inv.getInverse(mat)
      
      out.copy(fromHEADING)
      out.applyMatrix4(inv)
      
      vec.crossVectors(toUP, toFORWARD)
      mat.makeBasis(vec, toUP, toFORWARD)
      //inv.getInverse(mat)
      
      out.applyMatrix4(mat)
    }
  })(),
  
  
  //  Set a THREE.Quaterion or THREE.Euler to a relational rotation ("from-to") derived from two sets of basis vectors
  rotation_byvectors:(function() {
    let mat = new THREE.Matrix4()
    let inv = new THREE.Matrix4()
    let vec = new THREE.Vector3()
    
    return function(out, fromHEADING, fromFORWARD, fromUP, toFORWARD, toUP) {
      if (!fromHEADING.isVector3) {
        fromHEADING = libek.direction.vector[fromHEADING]
      }
      if (!fromFORWARD.isVector3) {
        fromFORWARD = libek.direction.vector[fromFORWARD]
        toFORWARD = libek.direction.vector[toFORWARD]
        fromUP = libek.direction.vector[fromUP]
        toUP = libek.direction.vector[toUP]
      }
      
      vec.crossVectors(fromUP, fromFORWARD)
      mat.makeBasis(vec, fromUP, fromFORWARD)
      inv.getInverse(mat)
      
      vec.crossVectors(toUP, toFORWARD)
      mat.makeBasis(vec, toUP, toFORWARD)
      //inv.getInverse(mat)
      
      mat.multiply(inv)
      out.setFromRotationMatrix(mat) 
    }
  })(),
  
  /* Rotate and position a THREE.Object3D to set it so that it's origin is at the center of the face of a unit cube, its up axis points in the "up" (+Y) direction, and
     its forward axis (-Z) is pointed in the "forward" direction.
     
     This presently uses a set of 24 hard-coded presets, but it really should compute it (so as to allow two-vector orientation).
  */
  setOrientation:(function() {
     // Position and rotation presets for orienting an object along a surface
    let inside_orientation = [ 
      
      //UP
      [ 0,0,
        { rotation:new THREE.Euler(0, T*0.50, 0), position:new THREE.Vector3() },
        { rotation:new THREE.Euler(0, T*0.25, 0), position:new THREE.Vector3() },
        { rotation:new THREE.Euler(0, T*0.00, 0), position:new THREE.Vector3() },
        { rotation:new THREE.Euler(0, T*0.75, 0), position:new THREE.Vector3() }  ],
      
      //down
      [ 0,0,
        { rotation:new THREE.Euler(0, T*0.50, T*0.50), position:new THREE.Vector3(0,1,0) },
        { rotation:new THREE.Euler(0, T*0.25, T*0.50), position:new THREE.Vector3(0,1,0) },
        { rotation:new THREE.Euler(0, T*0.00, T*0.50), position:new THREE.Vector3(0,1,0) },
        { rotation:new THREE.Euler(0, T*0.75, T*0.50), position:new THREE.Vector3(0,1,0) }  ],
      
      //north
      [ {rotation:new THREE.Euler(T*0.75, T*0.50, 0), position:new THREE.Vector3(0,0.5,0.5) },
        {rotation:new THREE.Euler(T*0.75, T*0.00, 0), position:new THREE.Vector3(0,0.5,0.5) },
        0,  
        {rotation:new THREE.Euler(T*0.75, T*0.25, 0), position:new THREE.Vector3(0,0.5,0.5) },
        0,
        {rotation:new THREE.Euler(T*0.75, T*0.75, 0), position:new THREE.Vector3(0,0.5,0.5) }  ],
      
      //east
      [ { rotation:new THREE.Euler(T*0.25, 0, T*0.75), position:new THREE.Vector3(-0.5,0.5,0) },
        { rotation:new THREE.Euler(T*0.75, 0, T*0.75), position:new THREE.Vector3(-0.5,0.5,0) },
        { rotation:new THREE.Euler(T*0.50, 0, T*0.75), position:new THREE.Vector3(-0.5,0.5,0) },
        0,
        { rotation:new THREE.Euler(T*0.00, 0, T*0.75), position:new THREE.Vector3(-0.5,0.5,0) },
        0                                                                                       ],
      
      //south
      [ { rotation:new THREE.Euler(T*0.25, T*0.00, 0), position:new THREE.Vector3(0,0.5,-0.5) },
        { rotation:new THREE.Euler(T*0.25, T*0.50, 0), position:new THREE.Vector3(0,0.5,-0.5) },
        0,
        { rotation:new THREE.Euler(T*0.25, T*0.25, 0), position:new THREE.Vector3(0,0.5,-0.5) },
        0,
        { rotation:new THREE.Euler(T*0.25, T*0.75, 0), position:new THREE.Vector3(0,0.5,-0.5) }  ],
      
      //west
      [ { rotation:new THREE.Euler(T*0.25, 0, T*0.25), position:new THREE.Vector3(0.5,0.5,0) },
        { rotation:new THREE.Euler(T*0.75, 0, T*0.25), position:new THREE.Vector3(0.5,0.5,0) },
        { rotation:new THREE.Euler(T*0.50, 0, T*0.25), position:new THREE.Vector3(0.5,0.5,0) },
        0,
        { rotation:new THREE.Euler(T*0.00, 0, T*0.25), position:new THREE.Vector3(0.5,0.5,0) }, 
        0,                                                                                       ],
    ]
    let outside_orientation = [ 
      //UP
      [ 0,0,
        { rotation:new THREE.Euler(0, T*0.50, 0), position:new THREE.Vector3(0,1,0) },
        { rotation:new THREE.Euler(0, T*0.25, 0), position:new THREE.Vector3(0,1,0) },
        { rotation:new THREE.Euler(0, T*0.00, 0), position:new THREE.Vector3(0,1,0) },
        { rotation:new THREE.Euler(0, T*0.75, 0), position:new THREE.Vector3(0,1,0) }  ],
      
      //down
      [ 0,0,
        { rotation:new THREE.Euler(0, T*0.50, T*0.50), position:new THREE.Vector3() },
        { rotation:new THREE.Euler(0, T*0.25, T*0.50), position:new THREE.Vector3() },
        { rotation:new THREE.Euler(0, T*0.00, T*0.50), position:new THREE.Vector3() },
        { rotation:new THREE.Euler(0, T*0.75, T*0.50), position:new THREE.Vector3() }  ],
      
      //north
      [ {rotation:new THREE.Euler(T*0.25, T*0.50, 0), position:new THREE.Vector3(0,0.5, 0.5) },
        {rotation:new THREE.Euler(T*0.25, T*0.00, 0), position:new THREE.Vector3(0,0.5, 0.5) },
        0, 
        {rotation:new THREE.Euler(T*0.25, T*0.25, 0), position:new THREE.Vector3(0,0.5, 0.5) },
        0,
        {rotation:new THREE.Euler(T*0.25, T*0.75, 0), position:new THREE.Vector3(0,0.5, 0.5) }  ],
      
      //east
      [ { rotation:new THREE.Euler(T*0.25, 0, T*0.25), position:new THREE.Vector3(-0.5,0.5,0) },
        { rotation:new THREE.Euler(T*0.75, 0, T*0.25), position:new THREE.Vector3(-0.5,0.5,0) },
        { rotation:new THREE.Euler(T*0.50, 0, T*0.25), position:new THREE.Vector3(-0.5,0.5,0) },
        0,
        { rotation:new THREE.Euler(T*0.00, 0, T*0.25), position:new THREE.Vector3(-0.5,0.5,0) },
        0                                                                                       ],
      
      //south
      [ { rotation:new THREE.Euler(T*0.75, T*0.00, 0), position:new THREE.Vector3(0,0.5, -0.5) },
        { rotation:new THREE.Euler(T*0.75, T*0.50, 0), position:new THREE.Vector3(0,0.5, -0.5) },
        0,
        { rotation:new THREE.Euler(T*0.75, T*0.25, 0), position:new THREE.Vector3(0,0.5, -0.5) },
        0,
        { rotation:new THREE.Euler(T*0.75, T*0.75, 0), position:new THREE.Vector3(0,0.5, -0.5) }  ],
      
      //west
      [ { rotation:new THREE.Euler(T*0.25, 0, T*0.75), position:new THREE.Vector3(0.5,0.5,0) },
        { rotation:new THREE.Euler(T*0.75, 0, T*0.75), position:new THREE.Vector3(0.5,0.5,0) },
        { rotation:new THREE.Euler(T*0.50, 0, T*0.75), position:new THREE.Vector3(0.5,0.5,0) },
        0,
        { rotation:new THREE.Euler(T*0.00, 0, T*0.75), position:new THREE.Vector3(0.5,0.5,0) }, 
        0,                                                                                       ],
    ]    
     
    return function(out, forward, up, inside=true) {    
      if (!out) {
        out = {}
      }  
      if (typeof(up) == "string") {
        up = libek.direction.code[up.toUpperCase()]
      }
      if (typeof(forward) == "string") {
        forward = libek.direction.code[forward.toUpperCase()]
      }
      
      if (inside) {
        Object.assign(out, inside_orientation[up-1][forward-1])
      }
      else {
        Object.assign(out, outside_orientation[up-1][forward-1])
      }
      return out
    }
  })(),
}
  
libek.direction.getKeyDirection = (function() {
  let _keycodetbl = {  
    up:0,
    right:1,
    down:2,
    left:3,
  }    
  let _keyvector = [
    { vector:new THREE.Vector3( 0, 0, -1), inv:new THREE.Vector3( 0,  0,  1), code:libek.direction.code.SOUTH },   //south
    { vector:new THREE.Vector3( 1, 0,  0), inv:new THREE.Vector3(-1,  0,  0), code:libek.direction.code.WEST },   //west
    { vector:new THREE.Vector3( 0, 0,  1), inv:new THREE.Vector3( 0,  0, -1), code:libek.direction.code.NORTH },   //north
    { vector:new THREE.Vector3(-1, 0,  0), inv:new THREE.Vector3( 1,  0,  0), code:libek.direction.code.EAST },   //east
  ]
  
  return function(key, camtheta) {    
    return _keyvector[(_keycodetbl[key] + libek.rad_tosector(-camtheta+T*0.125,4)) % 4]
  }
})();

libek.direction.sideorientations = [
  0,
  libek.direction.setOrientation(null, libek.direction.code.NORTH, libek.direction.code.UP, false),
  libek.direction.setOrientation(null, libek.direction.code.SOUTH, libek.direction.code.DOWN, false),
  libek.direction.setOrientation(null, libek.direction.code.UP, libek.direction.code.NORTH, false),
  libek.direction.setOrientation(null, libek.direction.code.UP, libek.direction.code.EAST, false),
  libek.direction.setOrientation(null, libek.direction.code.UP, libek.direction.code.SOUTH, false),
  libek.direction.setOrientation(null, libek.direction.code.UP, libek.direction.code.WEST, false)
]
  
  

















