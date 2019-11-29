export { Ekvx1Interpreter }
import { trit, T, getAsset, storeAsset, releaseAsset, Material } from '../libek/libek.js'
import { property, properties_fromstring, mergeObjects, parseVec3, parseColor } from '../libek/util.js'

import { orthotCTL } from './orthot.js'
import { parseO2Orientation } from './util.js'
import { Wall, ScenePortal, InfoBlock, Stair, PushBlock, Crate, IceBlock, Key, Lock, Flag, Exit } from './simpleobjects.js'
import { Ladder, Portal, Button, Icefloor } from './attachments.js'
import { Gate, GateGroup } from './gate.js'
import { Mouse, Moose } from './creatures.js'
import { direction } from '../libek/direction.js'

let materials = {
  man:["hsl(25, 80%, 60%)", "blue", "hsl(15, 100%, 15%)", "black", {color:"black", metalness:1}, {color:"white", emissive:"yellow", emissiveIntensity:1}],
  flag:["brown", "white"],
  portal:[{color:"yellow", emissive:"yellow", emissiveIntensity:0.4 }, {color:"cyan", transparent:true, opacity:0.5}],
  paneportal:["white", "yellow", {color:"blue", transparent:true, opacity:0.25}, "white"],
  pushblock:["white", "red", "black"],
  lock:["white", "black"],
  key:["white"],
  crate:["hsl(20, 100%, 50%)", "black", "hsl(25, 90%, 25%)", "hsl(22, 100%, 55%)" ],
  iceblock:[{color:"white", metalness:0.25, roughness:1 }, "blue", "cyan", "hsl(175, 100%, 75%)", {color:"blue", transparent:true, opacity:0.25, metalness:1, roughness:0.5}],
  icefloor:[{color:"white", metalness:0.25, roughness:1 }, "blue", "cyan", "hsl(175, 100%, 75%)", {color:"blue", transparent:true, opacity:0.25, metalness:1, roughness:0.5}, "black"],
  mouse:["hsl(20, 100%, 50%)", "hsl(0, 100%, 70%)", {color:"green", emissive:"green", emissiveIntensity:1}, "hsl(30, 100%, 20%)"],
  moose:["hsl(20, 100%, 50%)", "black", "hsl(30, 100%, 20%)", {color:"red", emissive:"red", emissiveIntensity:1}],
  InfoBlockBase:["green", "yellow"],
  InfoQMark:["yellow"],
  markmats:[{color:"green", emissive:"green", emissiveIntensity:0.333}, {color:"black", transparent:true, opacity:0.4}],
  cursormats:[{color:"white", emissive:"white", emissiveIntensity:0.333}, {color:"black", transparent:true, opacity:0.4}],
  stairs:["white"],
  gate:["white"],
  button:["red"],
  ladder:["brown"],
}

let walldefs, bxtbldr, walltemplates
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
  walldefs[id] = bxtbldr.build_Terraindef( sfc_v,sfc_v,sfc_v,sfc_v, sfc_h,sfc_h )
  return walldefs[id]
}

var Ekvx1Interpreter = {
  configure:function(zone, ekvx) {
    zone.playerMaterials = materials.man
    walldefs = {}
    bxtbldr = zone.bxtbldr
    walltemplates = {}
    zone.blackwall = defineWallTerrain( "blackwall", "rgba,0,0,0,1")
    ekvx.loadConfig( (id, rawtemplate) => {
      let template = properties_fromstring(rawtemplate.data)

      if (!template.type) {
        return undefined
      }

      switch(template.type) {
        case undefined:
          return undefined
        case 'wall': {
          template.id = id
          if (!template.color) {
            template.color = "rgba,1,1,1,1"
          }
          if (walltemplates[template.color]) {
            return walltemplates[template.color]
          }
          defineWallTerrain(id, template.color)
          walltemplates[template.color] = template
        }
          break
        default:
          //console.log(template)
          break
      }
      return template
    })
  },
  load:function(zone, ldstate, ekvx) {
    let ldstage =  1
    let vxc = zone.vxc
    ekvx.loadData( (x,y,z, template, data) => {
      z *= -1

      if (x<ldstate.min.x) ldstate.min.x=x
      if (y<ldstate.min.y) ldstate.min.y=y
      if (z<ldstate.min.z) ldstate.min.z=z

      if (x>ldstate.max.x) ldstate.max.x=x
      if (y>ldstate.max.y) ldstate.max.y=y
      if (z>ldstate.max.z) ldstate.max.z=z

      if (data) {
        data = properties_fromstring(data)
      }

      let datas = [template, data]

      let loc = vxc.get(x,y,z)
      let gobj
      let align, color, mats
      let adjctn


      // If an object has an enable or disable code, it gets enabled or disabled based on codes persisted Progress Codes.
      //  But, gates are a special case - A code specified on a gate is applied to the entire gategroup which the gate is a member of
      if (template.type != "gate") {
        let enableInfo = property("if", datas)
        let disableInfo = property("ifnot", datas)

        if (enableInfo && enableInfo != "") {
          if (!orthotCTL.matchCode(enableInfo)) {
            return false
          }
        }
        if (disableInfo && disableInfo != "") {
          if (orthotCTL.matchCode(disableInfo)) {
            return false
          }
        }
      }

      if (ldstage == 1) {
        switch(template.type) {

          // return "true" to defer side-attached objects to a 2nd pass (need to make sure that the carrying objects are instantiated first)
          default:
            return true
            break

          case 'wall':
            vxc.loadTerrain(x,y,z, walldefs[template.id])
            zone.putGameobject(loc, new Wall(zone))
            break
          case 'stairs':
            color = property("color", datas, "white", parseColor)
            mats = materials.stairs
            if (color) {
              mats = mats.slice()
              mats[0] = color
            }
            align = property("align", datas, undefined, parseO2Orientation)
            gobj = new Stair(zone, mats, align)
            adjctn = zone.getAdjacentCTN(loc, direction.invert[align.up])
            vxc.setTerrainKnockout(adjctn, align.up)
            adjctn = zone.getAdjacentCTN(loc, direction.invert[align.forward])
            vxc.setTerrainKnockout(adjctn, align.forward)
          break
          case 'key': {
            color = property("color", datas, "white")
            let code = property("code", datas)
            gobj = new Key(zone, color, code, materials.key)
            zone.keys.push(gobj)
          } break
          case 'lock': {
            color = property("color", datas, "white")
            let code = property("code", datas)
            gobj = new Lock(zone, color, code, materials.lock)
            zone.locks.push(gobj)
          } break
          case 'target': {
            let campos = property("camPos", datas, undefined, parseVec3)
            campos.z *= -1
            campos.x = campos.x - x
            campos.y = campos.y - y + 0.5
            campos.z = campos.z - z
            zone.targets[property("name", datas)] = {
              loc:loc,
              campos:campos
            }
          } break
          case 'pblock':
            color = property("color", datas, "red", parseColor)
            mats = materials.pushblock
            if (color) {
              mats = mats.slice()
              mats[1] = color
            }
            gobj = new PushBlock(zone, mats)
            break
          case 'crate':
            gobj = new Crate(zone, materials.crate)
            break
          case 'iceblock':
            gobj = new IceBlock(zone, materials.iceblock)
            break
          case 'sceneportal': {
            let dest = property("dest", datas)
            let target = property("target", datas)
            gobj = new ScenePortal(zone, dest, target, materials.portal)
          }
          break

          case 'space_light':
          case 'face_light':
          //  ...  Will have to re-think lighting.  Previous version used unrestricted dynamic lighting, computed it directly and baked it in as VertexColors,
          //        and had lights only affect dynamic objects (for which Unity would base decisions off of proximity between objects and lights)
          //
          //  For now, going with a global directional light
            /*
            let light = new THREE.PointLight(
              property( "color", 16, libek.util.color.toBinary, data, template),
              property( "intensity", 1, Number.parseFloat, data, template),
              property( "range", 16, Number.parseFloat, data, template)/5,
              1
            )
            light.position.set( x,y,z );
            zone.scene.add( light );

            console.log(light)
            */
            break
          case "start": {
              let campos = property("camPos", datas, undefined, parseVec3)
              campos.z *= -1
              ldstate.start_align = property("align", datas, undefined, parseO2Orientation)
              ldstate.start_fpmode = property("camPos", datas) == "fp"
              campos.x = campos.x - x
              campos.y = campos.y - y + 0.5
              campos.z = campos.z - z
              zone.targets.__STARTLOC = {
                loc:loc,
                campos:campos
              }
              let tipMSG = property("tip", datas)
              let defeatMSG
              if (zone.resetCause == "defeated") {
                defeatMSG = property("defeat", datas)
                if (!defeatMSG) {
                  defeatMSG = property("death", datas)
                }
              }
              
              // If the startblock data has a message specified, set up am invisible InfoBlock for it
              if ( (tipMSG != undefined) | (defeatMSG != undefined) ) {
                let info_obj = new InfoBlock(zone, false, tipMSG, defeatMSG)
                ldstate.loaded_objects.push(info_obj)
                zone.putGameobject(x,y,z, info_obj)
              }
              
            }
            break
          case "info":
            gobj = new InfoBlock(zone, true, property("tip", datas), undefined, materials.InfoBlockBase, materials.InfoQMark)
            console.log(datas)
            break
          case "cammode":
            //console.log(datas)
          break
          case "gate": {
            color = property("color", datas, "white", parseColor)
            mats = materials.gate
            if (color) {
              mats = mats.slice()
              mats[0] = color
            }
            align = property("align", datas, undefined, parseO2Orientation)
            let mprops = mergeObjects(datas)
            let gate = new Gate(zone, loc, mats, align, mprops)
            ldstate.gategroups.push(new GateGroup(zone, gate))
          }
          break
          case "moose": {
            align = property("align", datas, undefined, parseO2Orientation)
            gobj = new Moose(zone, align, materials.moose)
          }
          break
          case "mouse": {
            align = property("align", datas, undefined, parseO2Orientation)
            gobj = new Mouse(zone, align, materials.mouse)
          }
          break
          case "flag": {
            let mprops = mergeObjects(datas)
            align = property("align", datas, undefined, parseO2Orientation)
            let code = property("code", datas)
            //console.log("FLAG", mprops)
            gobj = new Flag(zone, align, code, materials.flag)
          }
          break
          case "exit": {
            let mprops = mergeObjects(datas)
            align = property("align", datas, undefined, parseO2Orientation)
            //let code = property("code", datas)
            let dest = property("dest", datas)
            let target = property("target", datas)
            gobj = new Exit(zone, align, dest, target, materials.portal)
          }
          break
        }
      }
      else {
        switch(template.type) {
          case "paneportal": {
              let p_class = property("class", datas)
              let p_name = property("name", datas)
              let p_target = property("target", datas)

              align = property("align", datas, undefined, parseO2Orientation)
              vxc.setTerrainKnockout(loc, align.up)
              
              color = property("color", datas, "white", parseColor)
              mats = materials.paneportal
              if (color) {
                mats = mats.slice()
                mats[0] = color
              }
              
              let portal = new Portal(
                align,
                mats,
                p_class, p_name, p_target
              )
              zone.attach(x,y,z, portal)

              if (p_target && p_class) {
                console.log("WARNING:  portal defines both single-target and class-based multitargeting (can't do both):", portal)
              }

              if (p_name) {
                ldstate.portals_byname[p_name] = portal
              }
              if (p_target) {
                ldstate.targetted_portals.push(portal)
                portal.target = p_target
              }
              if (p_class) {
                let clist = ldstate.portals_byclass[p_class]
                if (!clist) {
                  clist = ldstate.portals_byclass[p_class] = []
                }
                clist.push(portal)
              }
            }
            break
          case "icefloor":
            //console.log("icefloor", datas)
            align = property("align", datas, undefined, parseO2Orientation)
            vxc.setTerrainKnockout(loc, align.up)
            let icf = new Icefloor( align, materials.icefloor )
            zone.attach(x,y,z, icf)
            break
          case "ladder":
            color = property("color", datas, "white", parseColor)
            mats = materials.ladder
            if (color) {
              mats[0] = color
            } 
            let ldr = new Ladder(
              property("align", datas, undefined, parseO2Orientation),
              mats
            )
            zone.attach(x,y,z, ldr)
            break
          case "button":
            color = property("color", datas, "white", parseColor)
            mats = materials.ladder
            if (color) {
              mats[0] = color
            }
            
            let btn = new Button( zone,
              property("align", datas, undefined, parseO2Orientation),
              mats,
              property("size", datas, "small"),
              property("press", datas),
              property("release", datas)
            )
            zone.attach(x,y,z, btn)
            break
          default:
            console.log(datas)
            break
        }
      }

      if (gobj) {
        ldstate.loaded_objects.push(gobj)
        zone.putGameobject(x,y,z, gobj)
      }
      return false
    },
    function() {
      ldstage=2
    })
  }
}