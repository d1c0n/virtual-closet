import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";
import { GrabGesture, ReleaseGesture, PointingUpGesture, PeaceGesture, ThubUp } from "./gestures.js";
import './index.css';

import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import vision from "@mediapipe/tasks-vision";

//                   glasses  , hat      , mask
const objects     = [undefined, undefined, undefined];
const obj_width   = [undefined, undefined, undefined];
const objects_box = [undefined, undefined, undefined];
const GLASSES_IDX = 0;
const HAT_IDX = 1;
const MASK_IDX = 2;
const name_to_idx = {"glasses": GLASSES_IDX, "hats": HAT_IDX, "mask": MASK_IDX}
const idx_to_name = {0: "glasses", 1: "hats", 2: "mask"}

const OBJECT_SCALE = 0.5;

let held_object = undefined;
let current_hold_item_box = undefined;
let held_object_index = GLASSES_IDX;
let carousel_idx = GLASSES_IDX;
let held_object_rescale_to_original_value = undefined;


const carousel_element_class = "carousel-item";
let current_item_hovered = undefined;

let current_selected_object = undefined;

let bottom_carousel = document.getElementById("glasses-carousel");
let fromCarousel = false;

let last_vertical_carousel_click = 0;
const vertical_carousel_click_threshold = 500;


let is_animating_trash_bin = false;
let is_trash_icon_toggled = false;

const THUMB_UP_THRESHOLD = 3;
let last_thumbs_up_time = 0;


function toggle_trash_icon() {
  is_trash_icon_toggled = true;
  var object = document.getElementById("trash-bin");
  object.style.left = "50px";
}

function trash_feedback() {
  is_animating_trash_bin = true;
  // make the trash bin bigger for a second and then smaller again
  var object = document.getElementById("trash-bin");
  object.style.width = "20%";
  object.style.height = "20%";
  setTimeout(function() {
    object.style.width = "15%";
    object.style.height = "15%";
    is_animating_trash_bin = false;
  }
  , 400);
}

function reverse_toggle_trash_icon() {
  is_trash_icon_toggled = false;
  var object = document.getElementById("trash-bin");
  object.style.left = "-150px";
}


const { FaceLandmarker, FilesetResolver, GestureRecognizer } = vision;

import * as THREE from "three";
const video = document.getElementById("video");
// Request access to webcam
navigator.mediaDevices
  .getUserMedia({ video: true })
  .then((stream) => {
    video.srcObject = stream;
    video.addEventListener("loadeddata", predictWebcam);
    generateFaceLandmarker();
    const predict = setInterval(predictWebcam, 16);
  })
  .catch((error) => {
    console.error("Error accessing webcam:", error);
  });

let faceLandmarker;
let gestureRecognizer;

async function generateFaceLandmarker() {
  // Read more `CopyWebpackPlugin`, copy wasm set from "https://cdn.skypack.dev/node_modules" to `/wasm`
  const filesetResolver = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
  );
  faceLandmarker = await FaceLandmarker.createFromOptions(
    filesetResolver,
    {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
        delegate: "GPU",
      },
      outputFaceBlendshapes: true,
      runningMode: "VIDEO",
      numFaces: 1,
    });
  gestureRecognizer = await GestureRecognizer.createFromOptions(
    filesetResolver,
    {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-tasks/gesture_recognizer/gesture_recognizer.task",
        delegate: "GPU",
        minTrackingConfidence: 0.1,
      },
      runningMode: "VIDEO",
      numHands: 2

    });
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(120, 5 / 4, 0.1, 1000);

///////////////////////// Renderer setup

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const BLOOM_SCENE = 1;

const bloomLayer = new THREE.Layers();
bloomLayer.set( BLOOM_SCENE );


const renderScene = new RenderPass( scene, camera );

const params = {
  exposure: 1,
  strength: 1,
  threshold: 0,
  radius: 0.01
};


const bloomPass = new UnrealBloomPass( new THREE.Vector2( window.innerWidth, window.innerHeight ), 1.5, 0.4, 0.85 );
bloomPass.threshold = params.threshold;
bloomPass.strength = params.strength;
bloomPass.radius = params.radius;

const bloomComposer = new EffectComposer( renderer );
bloomComposer.renderToScreen = false;
bloomComposer.addPass( renderScene );
bloomComposer.addPass( bloomPass );

const mixPass = new ShaderPass(
  new THREE.ShaderMaterial( {
    uniforms: {
      baseTexture: { value: null },
      bloomTexture: { value: bloomComposer.renderTarget2.texture }
    },
    vertexShader: document.getElementById( 'vertexshader' ).textContent,
    fragmentShader: document.getElementById( 'fragmentshader' ).textContent,
    defines: {}
  } ), 'baseTexture'
);
mixPass.needsSwap = true;

const outputPass = new OutputPass( THREE.ReinhardToneMapping );

const finalComposer = new EffectComposer( renderer );
finalComposer.addPass( renderScene );
finalComposer.addPass( mixPass );
finalComposer.addPass( outputPass );


const raycaster = new THREE.Raycaster();


const materials = {};

const darkMaterial = new THREE.MeshBasicMaterial( { color: 'black' } );


/////////////////////////

const texture = new THREE.VideoTexture(video);
texture.minFilter = THREE.LinearFilter;
const planeGeometry = new THREE.PlaneGeometry(5, 4);
const planeMaterial = new THREE.MeshBasicMaterial({ map: texture });
let camion;

const sph_geometry = new THREE.SphereGeometry( 0.05, 32, 16 );
const sph_material = new THREE.MeshBasicMaterial( { color: 0xffff00 } );
let left_sphere = new THREE.Mesh( sph_geometry, sph_material );
materials[left_sphere.uuid] = sph_material;
left_sphere.layers.enable( BLOOM_SCENE );

const gesture_history = [];
const position_history = [];
const timestamp_history = [];
const gesture_history_size = 100;
const gesture_list = [new GrabGesture(0.2, 0.2), new ReleaseGesture(), new PointingUpGesture(0.01, 0.1), new PeaceGesture(), new ThubUp()]

let is_already_loading = false;

var gesture_trigger = function(event) {
  let matched_grab = gesture_list[0].matchGesture(gesture_history, timestamp_history, position_history);
  let matched_release = gesture_list[1].matchGesture(gesture_history, timestamp_history, position_history);
  let matched_pointing_up = gesture_list[2].matchGesture(gesture_history, timestamp_history, position_history);
  let matched_peace = gesture_list[3].matchGesture(gesture_history, timestamp_history, position_history);
  let matched_thub_up = gesture_list[4].matchGesture(gesture_history, timestamp_history, position_history);
  if (matched_grab) {
    // console.log("grab");
    sph_material.color.setHex(0x00ff00);
    if (left_sphere.scale.x > 0.6) {
        left_sphere.scale.x = left_sphere.scale.x * 0.8
        left_sphere.scale.y = left_sphere.scale.y * 0.8
        left_sphere.scale.z = left_sphere.scale.z * 0.8
    }
    if (current_selected_object != undefined) {
      for (let i = 0; i < objects.length; i++) {
        if (objects[i] != undefined && objects[i].uuid == current_selected_object.uuid) {
          objects[i] = undefined;
          obj_width[i] = undefined;
          held_object = current_selected_object;
          current_selected_object = undefined;
          current_hold_item_box = objects_box[i];
          held_object_index = i;
          /////
          let boundingBox = new THREE.Box3().setFromObject(held_object)
          let size = boundingBox.max.x - boundingBox.min.x // Returns Vector3
          let scale = OBJECT_SCALE / size;
          held_object_rescale_to_original_value = 1 / scale;
          fromCarousel = false;
          // if (size < (OBJECT_SCALE - 0.01) || size > (OBJECT_SCALE + 0.01)) {
          //   held_object.scale.set(scale, scale, scale);
          //   console.log("SCALING", scale);
          // }
        }
      }
    }
    else if (held_object == undefined) {
      let px = (left_sphere.position.x / 5) * window.innerWidth + window.innerWidth / 2;
      let py = window.innerHeight / 2 - ((left_sphere.position.y / 4) * window.innerHeight);
      let elements = document.elementsFromPoint(px, py)
      if (!is_already_loading) {
        // console.log(elements);
        elements.forEach(async element => {
            let classes = element.className.split(" ");
            // console.log(classes);
            // console.log(classes.indexOf(carousel_element_class));
            if (classes.indexOf(carousel_element_class) >= 0) {
              is_already_loading = true;
              fromCarousel = true;
              // console.log("carousel found");
              let element_id = element.id;
              let filename = "/".concat(element_id.split("-")[0], ".obj")
              // console.log("filename:", filename);
              await objLoader.load(
                filename,
                (object) => {
                  if (held_object != undefined) {
                    scene.remove(held_object);
                  }
                  let material = new THREE.MeshPhongMaterial({ color: element_id.split("-")[1], specular: 0x111111, shininess: 200 });
                  object = new THREE.Mesh(object.children[0].geometry, material);
                  held_object = object;
                  current_hold_item_box = element;
                  // console.log("GRABBED", current_hold_item_box);
                  scene.add(held_object);
                  is_already_loading = false;
                  /////
                  let boundingBox = new THREE.Box3().setFromObject(held_object)
                  let size = boundingBox.max.x - boundingBox.min.x // Returns Vector3
                  let scale = OBJECT_SCALE / size;
                  // console.log(scale)
                  held_object_rescale_to_original_value = 1 / scale;

                  if (size < (OBJECT_SCALE - 0.01) || size > (OBJECT_SCALE + 0.01)) {
                    held_object.scale.set(scale, scale, scale);
                    // console.log("SCALING", scale);
                  }
                },
                (xhr) => {
                  // console.log((xhr.loaded / xhr.total) * 100 + "% loaded");
                },
                (error) => {
                  console.log(error);
                  is_already_loading = false;
                }
              );
            }
        });
      }

    }
    if (held_object != undefined && !is_trash_icon_toggled) {
      toggle_trash_icon();
    }
    // crate a new sphere and add it to the scene in that position
  }
  else{
    if (left_sphere.scale.x < 1) {
        left_sphere.scale.x = left_sphere.scale.x * 1.2
        left_sphere.scale.y = left_sphere.scale.y * 1.2
        left_sphere.scale.z = left_sphere.scale.z * 1.2
    }
   }
  if (matched_release) {
    // console.log("release");
    // sph_material.color.setHex(0xff0000);
    if (held_object != undefined) {
      // check if the hand is on the thrash bin
      let px = (left_sphere.position.x / 5) * window.innerWidth + window.innerWidth / 2;
      let py = window.innerHeight / 2 - ((left_sphere.position.y / 4) * window.innerHeight);
      let bin = document.getElementById("trash-bin");
      const rect = bin.getBoundingClientRect();
      let distance2 = Math.pow((px - rect.x) / rect.width, 2) + Math.pow((py - rect.y) / rect.height, 2);
      if (distance2 < 2) {
        // delete the object
        scene.remove(held_object);
        // selected_objects[bottom_carousel.split("-")[0]].classList.remove("carousel-selected");
        held_object = undefined;
        trash_feedback();
        setTimeout(reverse_toggle_trash_icon, 600);
        current_hold_item_box.children[1].classList.remove("carousel-selected");
        current_hold_item_box = undefined;

        //document.getElementById('trash-bin').classList.add('hidden')
      }
      else {
        for (let i = 0; i < objects.length; i++) {
          const idx = fromCarousel ? carousel_idx : held_object_index;

          if (i == idx) {
            if (objects[i] != undefined) {
              scene.remove(objects[i]);
              obj_width[i] = undefined;
              objects_box[i].children[1].classList.remove("carousel-selected");
            }
            held_object.scale.set(
              held_object_rescale_to_original_value,
              held_object_rescale_to_original_value,
              held_object_rescale_to_original_value);

            objects[idx] = held_object;
            obj_width[idx] = held_object.geometry.boundingBox.max.x - held_object.geometry.boundingBox.min.x;
            // console.log("RELEASE", held_object_index, current_hold_item_box);
            objects_box[idx] = current_hold_item_box;
            current_hold_item_box.children[1].classList.add("carousel-selected");
          }
        }
        held_object = undefined;
        reverse_toggle_trash_icon()// document.getElementById('trash-bin').classList.add('hidden')
      }
    }
  }
  else if (matched_pointing_up) {
    // console.log("pointing up");
    sph_material.color.setHex(0x0000ff);
    let throttleTimeout;

    if (position_history.length > 2) {
      let last_movement_x = position_history[position_history.length - 2].x - position_history[position_history.length - 1].x;

      if ((last_movement_x > 0.05 || last_movement_x < -0.05) && !throttleTimeout) {
        throttleTimeout = setTimeout(() => {
          bottom_carousel.scrollBy({
            left: last_movement_x * 500,
            behavior: 'instant'
          });
          throttleTimeout = null;
        }, 200); // Adjust this value to best fit your needs
      }
    }
      // bottom_carousel.scrollBy(last_movement_x * 100, 0, "smooth");
      // console.log(last_movement_x);
      // if (last_movement_x > 0.05 || last_movement_x < -0.05) {
      //   console.log("scrolling");
      //   bottom_carousel.scrollBy(- last_movement_x, 0)

      // }

  }
  else if (matched_peace) {
    // console.log("Victory");
    sph_material.color.setHex(0x00ffff);
    // // get the elements behind the hand
    // let direction =  1 ? position_history[position_history.length - 1].x - position_history[position_history.length - 2].x > 0 : -1;
    if (Date.now() - last_vertical_carousel_click > vertical_carousel_click_threshold) {
      last_vertical_carousel_click = Date.now();
      let px = (left_sphere.position.x / 5) * window.innerWidth + window.innerWidth / 2;
      let py = window.innerHeight / 2 - ((left_sphere.position.y / 4) * window.innerHeight);
      let elements = document.elementsFromPoint(px, py);
      for (let i = 0; i < elements.length; i++) {
        if (elements[i].classList.contains("card")) {
          // console.log(elements[i].classList);
          elements[i].click();
          // set the held_object_index to the index of the object
          let cards = elements[i].parentElement.childNodes;
          for (let j = 0; j < cards.length; j++) {
            if (cards[j] == elements[i]) {
              held_object_index = (j - 1) / 2;
              // console.log("HOLD", held_object_index, " item type: ", idx_to_name[held_object_index]);
              break;
            }
          }
        }
      }
    }
  }
  else if (matched_thub_up) {
    // create a big heart from an image in the middle of the screen and add it to the scene
    // console.log("Thumbs up");
    sph_material.color.setHex(0xff4444);
    if (!document.getElementById("tutorial-card").classList.contains("hidden")) {
      document.getElementById("tutorial-card").classList.add("hidden");
            last_thumbs_up_time = Date.now() / 1000;
      document.getElementById("tutorial-card").children[0].src = undefined;

    }
    else {
    if ((Date.now()/1000) - last_thumbs_up_time > THUMB_UP_THRESHOLD) {
      last_thumbs_up_time = Date.now() / 1000;
      let heart = document.getElementById("heart");
      heart.classList.add("instagram-heart-anim");
      setTimeout(() => {
        heart.classList.remove("instagram-heart-anim");
      }
      , 1500);
    }
    }

  }
  else if (!matched_grab && !matched_release && !matched_pointing_up && !matched_peace && !matched_thub_up) {
    sph_material.color.setHex(0x333333);
  }
  return;
}

sph_material.addEventListener("gesture", gesture_trigger, false);

let face_3d;
let left_hand_3d;
left_sphere.renderOrder = -101
scene.add(left_sphere);

let right_hand_3d;
let lastVideoTime = -1;
let results = undefined;
let hands_results = undefined;
let left_hand_mean = undefined;
let right_hand_mean = undefined;


let glassesWidth;

async function predictWebcam() {
  let nowInMs = Date.now();
  results = faceLandmarker.detectForVideo(video, nowInMs);
  hands_results = gestureRecognizer.recognizeForVideo(video, nowInMs);
  if (results.faceLandmarks.length > 0) {
    scene.remove(face_3d);
    let points = [];
    for (let i = 0; i < results.faceLandmarks[0].length; i++) {
      points.push(
        new THREE.Vector3(
          // map x, y, z to -4, 4
          -(results.faceLandmarks[0][i].x - 0.5) * 5,
          (results.faceLandmarks[0][i].y - 0.5) * 4,
          results.faceLandmarks[0][i].z - 0.1
        )
      );
    }

    const face_geometry = new ConvexGeometry(points);
    const material_transparent = new THREE.MeshBasicMaterial({
      color: 0xffffff,
    });
    face_3d = new THREE.Mesh(face_geometry, material_transparent);
    //scene.add(face_3d);
        face_3d.material.colorWrite = false;
    face_3d.renderOrder = -100;
    face_3d.rotation.x = Math.PI;

    // glasses position
    if (objects[GLASSES_IDX]) {
      const box = new THREE.Box3().setFromObject(objects[GLASSES_IDX]);
      let objectWidth = obj_width[GLASSES_IDX];
      const d = getGlassesPosition(points, objectWidth);
      objects[GLASSES_IDX].position.set(d.x, d.y, d.z);
      objects[GLASSES_IDX].rotation.set(d.xr, d.yr, d.zr);
      objects[GLASSES_IDX].scale.set(d.scale*1.5, d.scale, d.scale);
    }
    // hat position
    if (objects[HAT_IDX]) {
      const box = new THREE.Box3().setFromObject(objects[HAT_IDX]);
      let objectWidth = obj_width[HAT_IDX];
      const d = getHatPosition(points, objectWidth);
      objects[HAT_IDX].position.set(d.x, d.y, d.z);
      objects[HAT_IDX].rotation.set(d.xr, d.yr, d.zr);
      objects[HAT_IDX].scale.set(d.scale, d.scale, d.scale);
    }
    // mask position
    if (objects[MASK_IDX]) {
      const box = new THREE.Box3().setFromObject(objects[MASK_IDX]);
      let objectWidth = obj_width[MASK_IDX];
      const d = getMaskPosition(points, objectWidth);
      objects[MASK_IDX].position.set(d.x, d.y, d.z);
      objects[MASK_IDX].rotation.set(d.xr, d.yr, d.zr);
      objects[MASK_IDX].scale.set(d.scale*1.5, d.scale, d.scale);
    }
  }
  if (hands_results.gestures) {
    for (let hand_idx = 0; hand_idx < hands_results.gestures.length; hand_idx++) {

      if (hands_results.handednesses[hand_idx][0].categoryName == "Left") {
        const hands_points_left = [];
          for (let i = 0; i < hands_results.landmarks[hand_idx].length; i++) {
            hands_points_left.push(
              new THREE.Vector3(
                -((hands_results.landmarks[hand_idx][i].x - 0.5) * 5),
                -((hands_results.landmarks[hand_idx][i].y - 0.5) * 4),
              )
            );
          }
          left_hand_mean = new THREE.Vector3();
          for (let i = 0; i < hands_points_left.length; i++) {
            left_hand_mean.add(hands_points_left[i]);
          }
          left_hand_mean.divideScalar(hands_points_left.length);
          gesture_history.push(hands_results.gestures[hand_idx][0].categoryName);
          position_history.push(left_hand_mean);
          timestamp_history.push(Date.now());
          if (gesture_history.length > gesture_history_size) {
            gesture_history.shift();
            position_history.shift();
            timestamp_history.shift();
          }
          sph_material.dispatchEvent( { type: 'gesture', message: hands_results.gestures[hand_idx][0].categoryName } );
          left_sphere.position.copy(left_hand_mean);
          left_sphere.rotation.x = Math.PI;
          left_sphere.rotation.y = Math.PI;

          // IF HAS OBJECT IN HAND, MOVE IT
          if (held_object != undefined) {
            held_object.position.x = left_hand_mean.x;
            held_object.position.y = left_hand_mean.y;
            held_object.position.z = left_hand_mean.z+0.1;
          }


          //////// handle hover of carousel items
          let px = (left_sphere.position.x / 5) * window.innerWidth + window.innerWidth / 2;
          let py = window.innerHeight / 2 - ((left_sphere.position.y / 4) * window.innerHeight);
          let elements = document.elementsFromPoint(px, py)
          let found_element = false;
          for (let i = 0; i < elements.length; i++) {
            if (elements[i].classList.contains(carousel_element_class)) {
              found_element = true;
              if (current_item_hovered != elements[i] && current_item_hovered != undefined) {
                current_item_hovered.classList.remove("h-44", "w-44");
                current_item_hovered.classList.add("h-36", "w-36");
              }
              elements[i].classList.remove("h-36", "w-36");
              elements[i].classList.add("h-44", "w-44");
              current_item_hovered = elements[i];
            }
            if (elements[i].id == "tutorial") {
              found_element = true;
              elements[i].children[0].classList.add("h-36");
              elements[i].children[0].classList.remove("h-28");
              elements[i].classList.add("h-36");
              elements[i].classList.remove("h-28");
              current_item_hovered = elements[i];
              document.getElementById("tutorial-card").classList.remove("hidden");
              document.getElementById("tutorial-card").children[0].src = "images/tutorial.gif"

            }
          }
          if (!found_element && current_item_hovered != undefined) {
            if (current_item_hovered.id == "tutorial") {  
              current_item_hovered.children[0].classList.remove("h-36");
              current_item_hovered.children[0].classList.add("h-28");
              current_item_hovered.classList.remove("h-36");
              current_item_hovered.classList.add("h-28");
              current_item_hovered = undefined;
            }
            else {
              current_item_hovered.classList.remove("h-44", "w-44");
            current_item_hovered.classList.add("h-36", "w-36");
            current_item_hovered = undefined;
            }
          }

          // if the hand is clear and is close to an object, I have to make it glow
          // console.log("held_object: ", held_object);
          if (held_object == undefined) {
            let closest_object = undefined;
            let closest_distance = 1000;
            for (let i = 0; i < objects.length; i++) {
              if (objects[i] != undefined) {
                let distance = left_hand_mean.distanceTo(objects[i].position);
                if (distance < closest_distance) {
                  closest_distance = distance;
                  closest_object = objects[i];
                }

              }
            }
            if (closest_object != undefined) {
              if (closest_distance < 0.7) {
                // console.log("closest dist: ", closest_distance);
                closest_object.layers.enable( BLOOM_SCENE );
                current_selected_object = closest_object;
              }
              else {
                current_selected_object = undefined;
                // deactivate glow on all objects
                for (let i = 0; i < objects.length; i++) {
                  if (objects[i] != undefined) {
                    objects[i].layers.disable( BLOOM_SCENE );
                  }
                }
              }
            }
          }
        }
    }
  }
  if (!is_animating_trash_bin) {
    let px = (left_sphere.position.x / 5) * window.innerWidth + window.innerWidth / 2;
    let py = window.innerHeight / 2 - ((left_sphere.position.y / 4) * window.innerHeight);
    let elements = document.elementsFromPoint(px, py)
    let found_element = false;
    for (let i = 0; i < elements.length; i++) {
      if (elements[i].id == "trash-bin") {
          // make the trash can a little bigger
          elements[i].style.width = "17%";
          elements[i].style.height = "17%";
          elements[i].children[0].classList.add("trash-bin-selected");
          found_element = true;
      }
    }
    if (!found_element) {
      let bin = document.getElementById("trash-bin");
      bin.style.width = "15%";
      bin.style.height = "15%";
      bin.children[0].classList.remove("trash-bin-selected");
    }
  }

}


function dressUp(event) {
  let object3d = event.object;  // 3D object
  let object_type = event.type; // HAT_IDX, GLASSES_IDX, MASK_IDX
  // delete the old object
  delete objects[object_type];
  scene.remove(objects[object_type]);
  // apply the new object
  objects[object_type] = object3d;
  scene.add(objects[object_type]);
  planeMesh.scale.x = -1;
}

const planeMesh = new THREE.Mesh(planeGeometry, planeMaterial);

planeMesh.scale.x = -1;
scene.add(planeMesh);
const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshPhongMaterial({ color: "purple" });
const material2 = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
const cube = new THREE.Mesh(geometry, material);
const pointLight = new THREE.PointLight(0xffffff);
pointLight.position.set(2, 2, 2);
scene.add(pointLight);
const objLoader = new OBJLoader();
const mtlLoader = new MTLLoader();
// await objLoader.load(
//   "/glasses.obj",
//   (object) => {
//     object.traverse((child) => {
//       if (child instanceof THREE.Mesh) {
//         child.material = material2;
//       }
//     });
//     camion = object;
//     var box = new THREE.Box3().setFromObject(camion);
//     glassesWidth = box.max.x - box.min.x;
//     // scene.add(camion);
//   },
//   (xhr) => {
//     // console.log((xhr.loaded / xhr.total) * 100 + "% loaded");
//   },
//   (error) => {
//     console.log(error);
//   }
// );


function render() {

  scene.traverse( darkenNonBloomed );
  bloomComposer.render();
  scene.traverse( restoreMaterial );

  finalComposer.render();

}

function darkenNonBloomed( obj ) {

  if ( obj.isMesh && bloomLayer.test( obj.layers ) === false ) {

    materials[ obj.uuid ] = obj.material;
    obj.material = darkMaterial;

  }

}

function restoreMaterial( obj ) {

  if ( materials[ obj.uuid ] ) {

    obj.material = materials[ obj.uuid ];
    delete materials[ obj.uuid ];
  }

}

camera.position.z = 1;
function animate() {
  requestAnimationFrame(animate);

  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    texture.needsUpdate = true;
  }
  render(scene, camera);
}
animate();





// TEST
document.querySelectorAll('.vertical-carousel').forEach(radio => {
  radio.addEventListener('change', function() {
      // Hide all carousels
      document.querySelectorAll('.cs').forEach(carousel => {
          carousel.style.display = 'none';
      });

      // Show the carousel corresponding to the checked radio button
      const carouselId = this.getAttribute('data-carousel');
      let carousel = document.getElementById(carouselId)
      carousel.style.display = 'flex';

      bottom_carousel = carousel;
      let obj_type = carouselId.split("-")[0]
      held_object_index = name_to_idx[obj_type]
      carousel_idx = name_to_idx[obj_type]
      // console.log("CURRENT CAROUSEL", idx_to_name[carousel_idx])
      // console.log(bottom_carousel);
  });
});

// Initialize by showing the carousel of the initially checked radio button
document.querySelector('.vertical-carousel:checked').dispatchEvent(new Event('change'));

//

function getGlassesPosition(points, width)
{
    const rightEye = new THREE.Vector3().copy(points[33]);
    const leftEye = new THREE.Vector3().copy(points[263]);
    const midPoint = new THREE.Vector3().addVectors(rightEye, leftEye).divideScalar(2);


    const xPosition = midPoint.x;
    const yPosition = -midPoint.y-0.25;
    const zPosition = midPoint.z + 0.3;

    const faceTop = points[10];
    const faceBottom = points[152];
    const nose = points[1];
    const leftEar = points[234];
    const rightEar = points[454];
    const faceAverage = new THREE.Vector3().addVectors(leftEar, rightEar).add(faceTop).add(faceBottom).divideScalar(4);

    // Euler
    const yawReference = new THREE.Vector3(faceAverage.x, 0, 1);
    const yawMovement = new THREE.Vector3(nose.x, 0, 1);
    let yawAngle = yawReference.angleTo(yawMovement);
    if (nose.x < faceAverage.x) {
      yawAngle =  - yawAngle;
    }
    const zRotation = yawAngle*2;

    const pitchReference = new THREE.Vector3(0, faceAverage.y, 1);
    const pitchMovement = new THREE.Vector3(0, nose.y, 1);
    let pitchAngle = pitchReference.angleTo(pitchMovement);
    if (nose.y < faceAverage.y) {
      pitchAngle =  - pitchAngle;
    }
    const xRotation = pitchAngle*2 - Math.PI/2 ;

    const rollReference = new THREE.Vector3(faceAverage.x, 0, 1);
    const rollMovement = new THREE.Vector3(faceTop.x, 0, 1);
    let rollAngle = rollReference.angleTo(rollMovement);
    if (faceTop.x < faceAverage.x) {
      rollAngle =  - rollAngle;
    }
    if (yawAngle > 0.3 || yawAngle < -0.3) {
      rollAngle *= 2;
    }
    if (-0.3< yawAngle < 0.3) {
      rollAngle =  rollAngle * 15;
    }
    const yRotation = rollAngle;

    // const box = new THREE.Box3().setFromObject(object);
    // const glassesWidth = box.max.x - box.min.x;
    const scale = 1.4* leftEye.distanceTo(rightEye) / width;


    return {"x": xPosition, "y": yPosition, "z": zPosition, "xr": xRotation, "yr": yRotation, "zr": zRotation, "scale": scale};

}


function getHatPosition(points, width)
{
    const rightEye = new THREE.Vector3().copy(points[33]);
    const leftEye = new THREE.Vector3().copy(points[263]);
    const faceTop = points[10];

    const midPoint = new THREE.Vector3().copy(faceTop);


    const xPosition = midPoint.x;
    const yPosition = -midPoint.y -0.1;
    const zPosition = midPoint.z - 0.2;

    const faceBottom = points[152];
    const nose = points[1];
    const leftEar = points[234];
    const rightEar = points[454];
    const faceAverage = new THREE.Vector3().addVectors(leftEar, rightEar).add(faceTop).add(faceBottom).divideScalar(4);

    // Euler
    const yawReference = new THREE.Vector3(faceAverage.x, 0, 1);
    const yawMovement = new THREE.Vector3(nose.x, 0, 1);
    let yawAngle = yawReference.angleTo(yawMovement);
    if (nose.x < faceAverage.x) {
      yawAngle =  - yawAngle;
    }
    const zRotation = yawAngle*2 + Math.PI/8;

    const pitchReference = new THREE.Vector3(0, faceAverage.y, 1);
    const pitchMovement = new THREE.Vector3(0, nose.y, 1);
    let pitchAngle = pitchReference.angleTo(pitchMovement);
    if (nose.y < faceAverage.y) {
      pitchAngle =  - pitchAngle;
    }
    const xRotation = pitchAngle - Math.PI/2 ;

    const rollReference = new THREE.Vector3(faceAverage.x, 0, 1);
    const rollMovement = new THREE.Vector3(faceTop.x, 0, 1);
    let rollAngle = -rollReference.angleTo(rollMovement);
    if (faceTop.x < faceAverage.x) {
      rollAngle =  - rollAngle;
    }
    if (yawAngle > 0.3 || yawAngle < -0.3) {
      rollAngle *= 2;
    }
    if (-0.3< yawAngle < 0.3) {
      rollAngle =  rollAngle * 15;
    }
    const yRotation = rollAngle;

    // const box = new THREE.Box3().setFromObject(object);
    // const glassesWidth = box.max.x - box.min.x;
    const scale = 3 * leftEye.distanceTo(rightEye) / width;


    return {"x": xPosition, "y": yPosition, "z": zPosition, "xr": xRotation, "yr": yRotation, "zr": zRotation, "scale": scale};

}


function getMaskPosition(points, width)
{
    const rightEye = new THREE.Vector3().copy(points[33]);
    const leftEye = new THREE.Vector3().copy(points[263]);
    const faceTop = points[10];

    const midPoint = new THREE.Vector3().addVectors(rightEye, leftEye).divideScalar(2);


    const xPosition = midPoint.x;
    const yPosition = -midPoint.y;
    const zPosition = midPoint.z + 0.3;

    const faceBottom = points[152];
    const nose = points[1];
    const leftEar = points[234];
    const rightEar = points[454];
    const faceAverage = new THREE.Vector3().addVectors(leftEar, rightEar).add(faceTop).add(faceBottom).divideScalar(4);

    // Euler
    const yawReference = new THREE.Vector3(faceAverage.x, 0, 1);
    const yawMovement = new THREE.Vector3(nose.x, 0, 1);
    let yawAngle = yawReference.angleTo(yawMovement);
    if (nose.x < faceAverage.x) {
      yawAngle =  - yawAngle;
    }
    const zRotation = yawAngle*2;

    const pitchReference = new THREE.Vector3(0, faceAverage.y, 1);
    const pitchMovement = new THREE.Vector3(0, nose.y, 1);
    let pitchAngle = pitchReference.angleTo(pitchMovement);
    if (nose.y < faceAverage.y) {
      pitchAngle =  - pitchAngle;
    }
    const xRotation = pitchAngle*2 - Math.PI/2  ;

    const rollReference = new THREE.Vector3(faceAverage.x, 0, 1);
    const rollMovement = new THREE.Vector3(faceTop.x, 0, 1);
    let rollAngle = rollReference.angleTo(rollMovement);
    if (faceTop.x < faceAverage.x) {
      rollAngle =  - rollAngle;
    }
    if (yawAngle > 0.3 || yawAngle < -0.3) {
      rollAngle *= 2;
    }
    if (-0.3< yawAngle < 0.3) {
      rollAngle =  rollAngle * 15;
    }
    const yRotation = rollAngle;

    // const box = new THREE.Box3().setFromObject(object);
    // const glassesWidth = box.max.x - box.min.x;
    const scale = 1.4 * leftEye.distanceTo(rightEye) / width;


    return {"x": xPosition, "y": yPosition, "z": zPosition, "xr": xRotation, "yr": yRotation, "zr": zRotation, "scale": scale};

}
