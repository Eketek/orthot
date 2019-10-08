export { Transform }

/*  Parameterized matrix transformations
 *
 *  
 *  Usage:
 *  1.  Instantiate the transform (either pass in a matrix frpom elsewhere or extract Transform.matrix and use it elsewhere)
 *  2.  Call the various transformation functions to define how the Transform works (Transform will retain references to all input parameters)
 *  3.  Then, every time the Transform should update, call Transform.apply()
*/
var Transform = function(matrix, base) {

  if (!matrix) {
    matrix = new THREE.Matrix4()
  }
  this.matrix = matrix
  
  
  let vec = new THREE.Vector3()
  let mat = new THREE.Matrix4()
  
  let ops = []
  this.reset = function() {
    ops = []
  }
  
  // Apply a scaling factor to the matrix.  
  this.scale = function(scale) {
    ops.push( function() {
      matrix.elements[0] *= scale.x
      matrix.elements[1] *= scale.x
      matrix.elements[2] *= scale.x
      matrix.elements[3] *= scale.x
      matrix.elements[4] *= scale.y
      matrix.elements[5] *= scale.y
      matrix.elements[6] *= scale.y
      matrix.elements[7] *= scale.y
      matrix.elements[8] *= scale.z   
      matrix.elements[9] *= scale.z   
      matrix.elements[10] *= scale.z   
      matrix.elements[11] *= scale.z      
      matrix.elements[12] *= scale.x
      matrix.elements[13] *= scale.y
      matrix.elements[14] *= scale.z
      
    })
  }
  
  // Scale the transposition only.
  this.scalePosition = function(scale) {
    ops.push( function() {      
      matrix.elements[12] *= scale.x
      matrix.elements[13] *= scale.y
      matrix.elements[14] *= scale.z
      //matrix.elements[11] *= scale.z
      
    })
  }
  
  // Apply a rotation & position pair 
  this.orient = function(orientation) {
    ops.push( function() {
      mat.makeRotationFromEuler(orientation.rotation)
      mat.setPosition(orientation.position)
      matrix.premultiply(mat)
    })
  }
      
  this.rotate = function(rotation) {
    if (rotation.isEuler) {
      ops.push( function() {
        mat.makeRotationFromEuler(rotation)
        matrix.premultiply(mat)
      })
    }
    if (rotation.isQuaternion) {
      ops.push( function() {
        mat.makeRotationFromQuaternion(rotation)
        matrix.premultiply(mat)
      })
    }
  }
  this.translate = function(offset) {
    ops.push( function() {
      mat.identity()
      mat.setPosition(offset)
      matrix.premultiply(mat)
    })
  }
  
  // Re-process the transformation.
  this.update = function() {
    if (base) {
      matrix.copy(base)
    }
    else {
      matrix.identity()
    }
    for (let op of ops) {
      op()
    }    
  }
}