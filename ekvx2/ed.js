export { renderCTL, inputCTL, sviewCTL, edCTL }

import { 
  tt, initLIBEK, 
  Display, 
  load, loadMuch, loadZIP, fetchText,
  assignMaterials, getAsset, storeAsset, 
  pickPlanepos, debug_tip 
} from '../libek/libek.js'
import { UVspec, buildVariantMaterial, ManagedColor } from '../libek/shader.js'
import { QueryTriggeredButtonControl, SceneviewController } from '../libek/control.js'
import { clamp, putFloatingElement, centerElementOverElement } from '../libek/util.js'
import { NextEventManager, next, on } from '../libek/nextevent.js'
import { direction } from '../libek/direction.js'

// Global rendering properties & controls (Mainly, materials and managed shader properties)
var renderCTL = window.rctl = {
  uv2:new UVspec()
}

//Input controller.  Mouse & keyboard
var inputCTL = window.ictl = {}

// Screen-view controller:  Camera controller which performs orbitting, following, and a bit of flying.
var sviewCTL

var edCTL = {
  tiles:{},
  version:"0.1.0",
  event:new EventTarget(),
}

$(async function MAIN() {

  initLIBEK()

  let disp_elem = $("#editor").attr("tabindex", "0").get(0)
  disp_elem.addEventListener( 'contextmenu', function(evt) {evt.preventDefault()} )
  disp_elem.focus()
  renderCTL.display = Display(disp_elem, true)

  let TextureProps = {
    magFilter:THREE.NearestFilter,
    anisotropy:4,
  }
  /*
  edCTL.tiles.key = {
    source:edCTL.assets.symbols.image,
    x:0, y:0, w:64, h:64
  }
  */

  let UI_TILEGRAPHIC_SIZE = [32,32]
  let UI_TILEGRAPHIC_OFFSET = [0, 0]
  let UI_TILESHADOW_SIZE = 8
  let UI_TILESHADOW_OFFSET = [5,3]
  let UI_TILE_SIZE = [37,35]
  /*
  renderCTL.fg = new ManagedColor("yellow")
  renderCTL.bg1 = new ManagedColor("orange")
  renderCTL.bg2 = new ManagedColor("green")

  renderCTL.vxlMAT = buildVariantMaterial("standard", {
    map:edCTL.assets.wall_8bit_fg,
    bkgtex:edCTL.assets.patterns,
    uv2:renderCTL.uv2,
    roughness:0.76,
    metalness:0.05,
    sample:tt`
      vec4 mc = texture2D( map, vUv );
      vec4 bc = texture2D( bkgtex, uv2 );
      vec3 fgColor = vColor*mc.r + ${renderCTL.fg}*mc.g;
      vec3 bgColor = vColor*bc.r + ${renderCTL.bg1}*bc.g + ${renderCTL.bg2}*bc.b;
      sample = vec4(fgColor * mc.a + bgColor*(1.0-mc.a), 1.0);
    `
  })
  */

  let controlActive = false
  sviewCTL = window.sctl = new SceneviewController({
    camtarget:new THREE.Vector3(0,0,0),
    display:renderCTL.display,
    dom_evttarget:disp_elem,
    app_evttarget:edCTL.event,
    pickplane:new THREE.Plane(direction.vector.UP, 0),
    UpdcamUpdatepickplane:true,
    followspeed:1/60,
    campos_maxphi:Math.PI * 0.85,
    onCamUpdate:function() {
      controlActive = true
    },

    OrbitTargetMBTN:"rmb",
    ChaseTargetMBTN:"mmb",

    tpmode_fov:60
  })
  sviewCTL.run()

  let aboutBTN
  let toggleAboutBox = function() {
    $("#about").toggle()
    putFloatingElement($("#about")[0], aboutBTN)
  }
  on($("#hideabout"), "click", toggleAboutBox)
  aboutBTN = $("<div>").addClass("btn_active").text("About").click(toggleAboutBox)[0]
  $("#controls").append(aboutBTN)

  renderCTL.build_domOBJ = function(tile, color, location, css_class, event_handlers) {
    if (typeof(tile) == "string") {
     tile = edCTL.tiles[tile]
    }
    if (!tile) {
      return
    }
    if (!color) {
      color = new THREE.Color("white")
    }
    else if (!color.isColor) {
      color = new THREE.Color(color)
    }
    if (!location) {
      location = "#tools"
    }

    let cnv = document.createElement("canvas")
    let elem = $(cnv)
    if (css_class) {
      elem.addClass(css_class)
    }
    if (event_handlers) {
      for (let k in event_handlers) {
        elem.on(k, event_handlers[k])
      }
    }

    $(location).append(elem)

    cnv.width = UI_TILE_SIZE[0]
    cnv.height = UI_TILE_SIZE[1]

    let hilight = false

    //console.log(sz)
    let ctx = cnv.getContext('2d');
    let draw = function() {
      ctx.clearRect(0,0, UI_TILE_SIZE[0], UI_TILE_SIZE[1])

      if (hilight) {
        ctx.shadowOffsetX = 0
        ctx.shadowOffsetY = 0

        ctx.strokeStyle = "black"
        ctx.lineWidth = 4
        ctx.strokeRect(1,1, UI_TILE_SIZE[0]-2, UI_TILE_SIZE[1]-2)

        ctx.strokeStyle = color.getStyle()
        ctx.lineWidth = 2
        ctx.strokeRect(1,1, UI_TILE_SIZE[0]-2, UI_TILE_SIZE[1]-2)
      }

      ctx.shadowColor = 'rgba(0, 0, 0, .33333)';
      ctx.shadowOffsetX = UI_TILESHADOW_OFFSET[0]
      ctx.shadowOffsetY = UI_TILESHADOW_OFFSET[1]
      ctx.drawImage(tile.source, tile.x, tile.y, tile.w, tile.h, UI_TILEGRAPHIC_OFFSET[0], UI_TILEGRAPHIC_OFFSET[1], UI_TILEGRAPHIC_SIZE[0], UI_TILEGRAPHIC_SIZE[1]);

      let imgd = ctx.getImageData(0,0, UI_TILE_SIZE[0], UI_TILE_SIZE[1])
      let buf = imgd.data

      let r = color.r
      let g = color.g
      let b = color.b

      for (let i = 0; i < buf.length; i+= 4) {
        buf[i] =   buf[i]   * r
        buf[i+1] = buf[i+1] * g
        buf[i+2] = buf[i+2] * b
      }
      ctx.putImageData(imgd, 0, 0);
    }
    draw()

    elem.mouseover(function() {
      hilight = true
      draw()
    })
    elem.mouseout(function() {
      hilight = false
      draw()
    });

    return elem
  }

  // Item description display
  // These functions (orthot.showDescription and orthot.updateDescription and orthot.hideDescription) are used to allow items to show tooltips and run graphical
  // visualizarion routines.  These are called as objects or interface-elements are moused-over and moused-out
  /*
  let shownItem
  let tiptext = ""
  edCTL.showDescription = function(item) {
    if (shownItem && shownItem != item) {
      edCTL.hideDescription(shownItem)
    }
    shownItem = item
    tiptext = item.description ? item.description : ""
    if (item.visualizer) {
      item.visualizer(true)
      controlActive = true
    }
  }
  edCTL.updateDescription = function(item) {
    if (item != shownItem) {
      return
    }
    tiptext = item.description ? item.description : ""
    if (item.visualizer) {
      item.visualizer(true)
      controlActive = true
    }
  }

  edCTL.hideDescription = function(item) {
    if (item != shownItem) {
      return
    }
    shownItem = null
    tiptext = ""
    if (item.visualizer) {
      item.visualizer(false)
      controlActive = true
    }
  }
  */


  var run = function run () {
    requestAnimationFrame( run );
    edCTL.event.dispatchEvent(new Event("frame"))
    
    if (controlActive) {
      controlActive = false
      renderCTL.display.render()
    }
    
    //let mpos3d = pickPlanepos(renderCTL.display, evtman.mpos, sviewCTL.pickplane)
    //debug_tip(`${tiptext}<br>
    //Mouse position:  x=${mpos3d.x}, y=${mpos3d.y}, z=${mpos3d.z}`)
  }
  run()
})





















