export { Cube, Grid, Wfcube }
import { AXIS } from './libek.js'
import { direction } from './direction.js'

var Cube = function(size=1) {
  var geometry = new THREE.BoxGeometry( size,size,size );
  var material = new THREE.MeshBasicMaterial( { color: 0x00ff00 } );
  return new THREE.Mesh(geometry, material)
    //new THREE.BoxGeometry(1,1,1),
    //new THREE.MeshBasicMaterial( { color: 0x00ff00 } )
  //)
},

// Generate a renderable line grid.
//  The generated grid is aligned with one of three major axes and uses absolute space (no transformations)
var Grid = function(params={}) {
  let orientation = params.orientation ? params.orientation : AXIS.Y
  let spacewidth = params.spacewidth ? params.spacewidth : 2
  let major_spacewidth = params.major_spacewidth ? params.major_spacewidth : 8
  let edge_spaces = params.edge_spaces ? params.edge_spaces : 40
  let offset = params.offset
  let major_color = new THREE.Color(params.major_color ? params.major_color : 'hsl(0, 0%, 40%)')
  let minor_color = new THREE.Color(params.minor_color ? params.minor_color : 'hsl(0, 0%, 20%)')
  let x_axis_color = new THREE.Color(params.x_axis_color ? params.x_axis_color : 'hsl(0, 50%, 50%)')
  let y_axis_color = new THREE.Color(params.y_axis_color ? params.y_axis_color : 'hsl(240, 50%, 50%)')
  let z_axis_color = new THREE.Color(params.z_axis_color ? params.z_axis_color : 'hsl(120, 50%, 50%)')
  let axis_linewidth = params.axis_linewidth ? params.axis_linewidth : 2
  let major_linewidth = params.major_linewidth ? params.major_linewidth : 1
  let minor_linewidth = params.minor_linewidth ? params.minor_linewidth : 1

  let minorline_mat = new THREE.LineBasicMaterial( {color:minor_color, linewidth:minor_linewidth} )
  let majorline_mat = new THREE.LineBasicMaterial( {color:major_color, linewidth:major_linewidth} )
  let xaxline_mat = new THREE.LineBasicMaterial( {color:x_axis_color, linewidth:axis_linewidth} )
  let yaxline_mat = new THREE.LineBasicMaterial( {color:y_axis_color, linewidth:axis_linewidth} )
  let zaxline_mat = new THREE.LineBasicMaterial( {color:z_axis_color, linewidth:axis_linewidth} )

  if (typeof(offset) == "number") {
    switch (orientation) {
      case AXIS.X:
        offset = new THREE.Vector3(offset, 0, 0)
      break
      case AXIS.Y:
        offset = new THREE.Vector3(0, offset, 0)
      break
      case AXIS.Z:
        offset = new THREE.Vector3(0, 0, offset)
      break
    }
  }
  else if (typeof(offset) == "undefined") {
    offset = new THREE.Vector3()
  }


  let spacing_offset = new THREE.Vector3()

  let _max = edge_spaces/2
  let _min = -_max

  this.obj = new THREE.Object3D()

  let linegroup1 = []
  let linegroup2 = []

  this.horiz_axline = undefined
  this.vert_axline = undefined

  this.moveto = function(pos, do_updatecolors=true) {
    spacing_offset.copy(pos)
    spacing_offset.divideScalar(spacewidth).floor()
    this.obj.position.copy(spacing_offset).multiplyScalar(spacewidth)
    switch(orientation) {
      case AXIS.X:
        this.obj.position.x = pos.x
      break
      case AXIS.Y:
        this.obj.position.y = pos.y
      break
      case AXIS.Z:
        this.obj.position.z = pos.z
      break
    }
    if (do_updatecolors) {
      this.updateColors()
    }
  }

  this.updateColors = function() {
    switch(orientation) {
      case AXIS.X: {
        for (let i = 0; i <= edge_spaces; i++) {
          let y = i + _min + spacing_offset.y
          let line = linegroup1[i]
          if (y == 0) {
            line.material = zaxline_mat
          }
          else if (y%major_spacewidth == 0) {
            line.material = majorline_mat
          }
          else {
            line.material = minorline_mat
          }

          let z = i + _min + spacing_offset.z
          line = linegroup2[i]
          if (z == 0) {
            line.material = yaxline_mat
          }
          else if (z%major_spacewidth == 0) {
            line.material = majorline_mat
          }
          else {
            line.material = minorline_mat
          }
        }
      }
      break
      case AXIS.Y: {
        for (let i = 0; i <= edge_spaces; i++) {
          let x = i + _min + spacing_offset.x
          let line = linegroup1[i]
          if (x == 0) {
            line.material = zaxline_mat
          }
          else if (x%major_spacewidth == 0) {
            line.material = majorline_mat
          }
          else {
            line.material = minorline_mat
          }

          let z = i + _min + spacing_offset.z
          line = linegroup2[i]
          if (z == 0) {
            line.material = xaxline_mat
          }
          else if (z%major_spacewidth == 0) {
            line.material = majorline_mat
          }
          else {
            line.material = minorline_mat
          }
        }

      }
      break
      case AXIS.Z: {
        for (let i = 0; i <= edge_spaces; i++) {
          let x = i + _min + spacing_offset.x
          let line = linegroup1[i]
          if (x == 0) {
            line.material = yaxline_mat
          }
          else if (x%major_spacewidth == 0) {
            line.material = majorline_mat
          }
          else {
            line.material = minorline_mat
          }

          let y = i + _min + spacing_offset.y
          line = linegroup2[i]
          if (y == 0) {
            line.material = xaxline_mat
          }
          else if (y%major_spacewidth == 0) {
            line.material = majorline_mat
          }
          else {
            line.material = minorline_mat
          }
        }

      }
      break
    }
  }

  this.setAxis = function(axis, do_updatecolors=true) {
    orientation = axis
    switch(axis) {
      case AXIS.X:
        this.obj.setRotationFromAxisAngle(direction.vector.NORTH, T/4)
      break
      case AXIS.Y:
        //this.obj.rotation.set(0,0,0)
        this.obj.setRotationFromAxisAngle(direction.vector.UP, 0)
      break
      case AXIS.Z:
        //this.obj.rotation.set(-T/4,0,0)
        this.obj.setRotationFromAxisAngle(direction.vector.EAST, -T/4)
      break
    }
    if (do_updatecolors) {
      this.updateColors()
    }
  }


  for (let x = 0; x <= edge_spaces; x++) {
    let lgeom = new THREE.Geometry();
    lgeom.vertices.push(new THREE.Vector3(x+_min, 0, _min).multiplyScalar(spacewidth))
    lgeom.vertices.push(new THREE.Vector3(x+_min, 0, _max).multiplyScalar(spacewidth))
    let line = new THREE.Line(lgeom, minorline_mat)
    linegroup1.push(line)
    this.obj.add(line)
    //let line = new THREE.Line( geometry, majorline_mat );
  }

  for (let z = 0; z <= edge_spaces; z++) {
    lgeom = new THREE.Geometry();
    lgeom.vertices.push(new THREE.Vector3(_min, 0, z+_min).multiplyScalar(spacewidth))
    lgeom.vertices.push(new THREE.Vector3(_max, 0, z+_min).multiplyScalar(spacewidth))
    let line = new THREE.Line(lgeom, minorline_mat)
    linegroup2.push(line)
    this.obj.add(line)
  }

  this.moveto(offset, false)
  this.setAxis(orientation, true)

  return this

  //renderer.render( scene, camera );
}

var Wfcube = function(params = {}) {
  let size = params.size ? params.size : 40

  let color = new THREE.Color(params.major_color ? params.major_color : 'hsl(0, 0%, 100%)')
  let linewidth = params.axis_linewidth ? params.axis_linewidth : 2

  let mat = new THREE.LineBasicMaterial( {color:color, linewidth:linewidth} )

  let hsize = size/2

  let obj = new THREE.Object3D()
  let geom = new THREE.Geometry();
  geom.vertices.push(new THREE.Vector3(-hsize, 0, -hsize))
  geom.vertices.push(new THREE.Vector3(hsize, 0, -hsize))
  geom.vertices.push(new THREE.Vector3(hsize, 0, hsize))
  geom.vertices.push(new THREE.Vector3(-hsize, 0, hsize))
  geom.vertices.push(new THREE.Vector3(-hsize, 0, -hsize))
  geom.vertices.push(new THREE.Vector3(-hsize, size, -hsize))
  geom.vertices.push(new THREE.Vector3(hsize, size, -hsize))
  geom.vertices.push(new THREE.Vector3(hsize, size, hsize))
  geom.vertices.push(new THREE.Vector3(-hsize, size, hsize))
  geom.vertices.push(new THREE.Vector3(-hsize, size, -hsize))
  obj.add(new THREE.Line(geom, mat))
  geom = new THREE.Geometry();
  geom.vertices.push(new THREE.Vector3(hsize, 0, -hsize))
  geom.vertices.push(new THREE.Vector3(hsize, size, -hsize))
  obj.add(new THREE.Line(geom, mat))
  geom = new THREE.Geometry();
  geom.vertices.push(new THREE.Vector3(hsize, 0, hsize))
  geom.vertices.push(new THREE.Vector3(hsize, size, hsize))
  obj.add(new THREE.Line(geom, mat))
  geom = new THREE.Geometry();
  geom.vertices.push(new THREE.Vector3(-hsize, 0, hsize))
  geom.vertices.push(new THREE.Vector3(-hsize, size, hsize))
  obj.add(new THREE.Line(geom, mat))
  return obj

}