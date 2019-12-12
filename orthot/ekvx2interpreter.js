export { Ekvx2Interpreter }
import { trit, T, getAsset, storeAsset, releaseAsset, Material } from '../libek/libek.js'
import { property, properties_fromstring, mergeObjects, parseVec3, parseColor } from '../libek/util.js'

import { orthotCTL, renderCTL } from './orthot.js'
import { parseO2Orientation } from './util.js'
import { Wall, ScenePortal, InfoBlock, Stair, PushBlock, Crate, IceBlock, Key, Lock, Flag, Exit } from './simpleobjects.js'
import { Ladder, Portal, Button, Icefloor } from './attachments.js'
import { Gate, GateGroup } from './gate.js'
import { Mouse, Moose } from './creatures.js'
import { direction } from '../libek/direction.js'

let bxtbldr
let defineWallTerrain = function(id, color) {
  let sfc_v = bxtbldr.build_Sfcdef({
    color:color,
    tile:{
      rows:8,
      cols:8,
      x:Math.floor(Math.random()*4),
      y:4
    }
  })
  
  let sfc_h = bxtbldr.build_Sfcdef({
    color:color,
    tile:{
      rows:8,
      cols:8,
      x:Math.floor(Math.random()*5),
      y:0
    }
  })
  return bxtbldr.build_Terraindef( sfc_v,sfc_v,sfc_v,sfc_v, sfc_h,sfc_h )
}

var Ekvx2Interpreter = {
  configure:function(zone, ekvx) {
    bxtbldr = zone.bxtbldr
    zone.blackwall = defineWallTerrain( "blackwall", "rgba,0,0,0,1")
    zone.viewpoints = []
    // If the ekvx has not been prepared, expand, link, and process terrain data structures
    //  (for simplicity, this directly replaces objects on the ekvx data structure (which itself is a product of JSON parsing))
    if (!ekvx.expanded) {
      ekvx.expanded = true
      for (let sfcdefid in ekvx.Surfaces) {
        let sfcdef = ekvx.Surfaces[sfcdefid]
        
        // de-memoize the surface definition
        if (typeof(sfcdef.tile) == "number") {
          sfcdef.tile = ekvx.Memos[sfcdef.tile]
        }
        if (typeof(sfcdef.area8b) == "number") {
          sfcdef.area8b = ekvx.Memos[sfcdef.area8b]
        }
        
        // prepare BoxTerrain params / surface definition state data
        ekvx.Surfaces[sfcdefid] = bxtbldr.build_Sfcdef(sfcdef)
      }
      for (let terrainID in ekvx.Terrains) {
        let sfcdefids = ekvx.Terrains[terrainID]
        let sfcdefs = [
          ekvx.Surfaces[sfcdefids[0]],
          ekvx.Surfaces[sfcdefids[1]],
          ekvx.Surfaces[sfcdefids[2]],
          ekvx.Surfaces[sfcdefids[3]],
          ekvx.Surfaces[sfcdefids[4]],
          ekvx.Surfaces[sfcdefids[5]]
        ]
        ekvx.Terrains[terrainID] = bxtbldr.build_Terraindef.apply(bxtbldr, sfcdefs)
      }
    }
  },
  load:function(zone, ldstate, ekvx) {
    zone.playerMaterials = ["hsl(25, 80%, 60%)", "blue", "hsl(15, 100%, 15%)", "black", {color:"black", metalness:1}, {color:"white", emissive:"yellow", emissiveIntensity:1}]
    renderCTL.border.color = ekvx.Settings.NamedColors.border
    renderCTL.hiliteA.color = ekvx.Settings.NamedColors.hiliteA
    renderCTL.hiliteB.color = ekvx.Settings.NamedColors.hiliteB
    let vxc = zone.vxc
    let updBounds = function(x,y,z) {
      if (x<ldstate.min.x) ldstate.min.x=x
      if (y<ldstate.min.y) ldstate.min.y=y
      if (z<ldstate.min.z) ldstate.min.z=z

      if (x>ldstate.max.x) ldstate.max.x=x
      if (y>ldstate.max.y) ldstate.max.y=y
      if (z>ldstate.max.z) ldstate.max.z=z
    }
    // stage 1
    for (let obj of ekvx.Objects) {
      let [templateID, x,y,z, up, forward] = obj.$
      let template = ekvx.Templates[templateID]
      updBounds(x,y,z)
      let loc = vxc.get(x,y,z)
      let gobj
      let align, color, mats
      let adjctn
      switch(template.type) {
        case "wall":
          vxc.loadTerrain(x,y,z, ekvx.Terrains[obj.$[4]])
          zone.putGameobject(loc, new Wall(zone))
          break
        case "view":
          zone.viewpoints.push(new THREE.Vector3(x,y,z))
          break
        case 'pushblock':
          gobj = new PushBlock(zone, obj.materials)
          break
        case 'crate':
          gobj = new Crate(zone, obj.materials)
          break
        case 'iceblock':
          gobj = new IceBlock(zone, obj.materials)
          break
        case "mouse": 
          gobj = new Mouse(zone, { up:up, forward:forward }, obj.materials)
          break
        case "moose": 
          gobj = new Moose(zone, { up:up, forward:forward }, obj.materials)
          break
        case "key": {
          let materials = obj.materials
          let color = materials[0]
          if (typeof(color) == "object") {
            color = color.color
          }
          gobj = new Key(zone, color, color, materials)
          zone.keys.push(gobj)
        } break
        case "lock": {
          let materials = obj.materials
          let color = materials[0]
          if (typeof(color) == "object") {
            color = color.color
          }
          gobj = new Lock(zone, color, color, materials)
          zone.locks.push(gobj)
        } break
        case "stairs": {
          gobj = new Stair(zone, obj.materials, { up:up, forward:direction.invert[forward] })
          adjctn = zone.getAdjacentCTN(loc, direction.invert[up])
          vxc.setTerrainKnockout(adjctn, up)
          adjctn = zone.getAdjacentCTN(loc, direction.invert[forward])
          vxc.setTerrainKnockout(adjctn, forward)
        } break
        case "flag":
          gobj = new Flag(zone, { up:up, forward:forward }, obj.code, obj.materials)
          break
        case "gate": {
          let gateData = {
            extend:(obj.extend_signal != "" ? obj.extend_signal : undefined),
            retract:(obj.retract_signal != "" ? obj.retract_signal : undefined),
            toggle:(obj.toggle_signal != "" ? obj.toggle_signal : undefined),
            initial_state:(obj.start_extended ? "extended" : "retracted")
          }
          let gate = new Gate(zone, loc, obj.materials,  {up:up, forward:direction.invert[forward]}, gateData)
          ldstate.gategroups.push(new GateGroup(zone, gate))
        }
        break
        case "start": {
          zone.playerMaterials = obj.materials
          zone.targets.__STARTLOC = {
            loc:loc,
            align:{ up:up, forward:forward },
            campos:new THREE.Vector3(x+5,y+3.5,z+1),
            fpview:obj.fpview
          }
          
          let tipMSG = obj.startMSG
          let defeatMSG
          if (zone.resetCause == "defeated") {
            defeatMSG = obj.defeatMSG
          }
          
          if (tipMSG == "") {
            tipMSG = undefined
          }
          if (defeatMSG == "") {
            defeatMSG = undefined
          }
          
          // If the startblock data has a message specified, set up am invisible InfoBlock for it
          if ( (tipMSG != undefined) | (defeatMSG != undefined) ) {
            let info_obj = new InfoBlock(zone, false, tipMSG, defeatMSG)
            ldstate.loaded_objects.push(info_obj)
            zone.putGameobject(x,y,z, info_obj)
          }
        } break
        case "exit":
          gobj = new Exit(zone, { up:up, forward:forward }, obj.dest, obj.target, obj.materials)
          break
        case "zoneportal":
          gobj = new ScenePortal(zone, obj.dest, obj.target, obj.materials)
          break
        case "target": {
          zone.targets[obj.name] = {
            loc:loc,
            align:{ up:up, forward:forward },
            campos:new THREE.Vector3(x+5,y+3.5,z+1),
            fpview:obj.fpview
          }
        } break
        case "infoblock": {
          gobj = new InfoBlock(zone, true, obj.message, undefined, obj.materials, [obj.materials[1]])
          break
        }
      }
      if (gobj) {
        ldstate.loaded_objects.push(gobj)
        zone.putGameobject(x,y,z, gobj)
      }
    }
    
    // stage 2
    for (let obj of ekvx.Objects) {
      let [templateID, x,y,z] = obj.$
      let template = ekvx.Templates[templateID]
      updBounds(x,y,z)
      let loc = vxc.get(x,y,z)
      let gobj
      let align, color, mats
      let adjctn
      switch(template.type) {
        case "portal": {
          vxc.setTerrainKnockout(loc, obj.$[4])
                        
          let portal = new Portal(
            { up:obj.$[4], forward:obj.$[5] },
            obj.materials,
            obj.class, obj.name, obj.target
          )
          zone.attach(x,y,z, portal)

          if (obj.target && obj.class) {
            console.log("WARNING:  portal defines both single-target and class-based multitargeting (can't do both):", portal)
          }
          if (obj.name) {
            ldstate.portals_byname[obj.name] = portal
          }
          if (obj.target) {
            ldstate.targetted_portals.push(portal)
            portal.target = obj.target
          }
          if (obj.class) {
            let clist = ldstate.portals_byclass[obj.class]
            if (!clist) {
              clist = ldstate.portals_byclass[obj.class] = []
            }
            clist.push(portal)
          }
        } break
        case "ladder":
          let ldr = new Ladder( { up:obj.$[4], forward:obj.$[5] }, obj.materials)
          zone.attach(x,y,z, ldr)
          break
        case "button":
          let btn = new Button(zone, { up:obj.$[4], forward:obj.$[5] }, obj.materials, "small", obj.press, obj.release)
          zone.attach(x,y,z, btn)
          break
        case "icefloor":
          let icf = new Icefloor( { up:obj.$[4], forward:obj.$[5] }, obj.materials)
          zone.attach(x,y,z, icf)
          vxc.setTerrainKnockout(loc, obj.$[4])
          break
      }
    }
  }
}