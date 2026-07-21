import * as THREE from 'https://esm.sh/three@0.160.0/build/three.module.js';
import JSZip from 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm';
import { OrbitControls } from 'https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { GLTFExporter } from 'https://esm.sh/three@0.160.0/examples/jsm/exporters/GLTFExporter.js';
import { OBJLoader } from 'https://esm.sh/three@0.160.0/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'https://esm.sh/three@0.160.0/examples/jsm/loaders/STLLoader.js';
import { PLYLoader } from 'https://esm.sh/three@0.160.0/examples/jsm/loaders/PLYLoader.js';
import { GLTFLoader } from 'https://esm.sh/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';

const fileInput = document.getElementById('fileInput');
const browseBtn = document.getElementById('browseBtn');
const uploadBox = document.querySelector('.upload-box');
const fileList = document.getElementById('fileList');
const dropTitle = document.querySelector('.drop-zone__title');
const convertBtn = document.getElementById('convertBtn');
const outputFormat = document.getElementById('outputFormat');
const progressFill = document.getElementById('progressFill');
const progressLabel = document.getElementById('progressLabel');
const previewStatus = document.getElementById('previewStatus');
const downloadLink = document.getElementById('downloadLink');
const summaryText = document.getElementById('summaryText');

let selectedFiles = [];
let currentModel = null;
let scene = null;
let camera = null;
let renderer = null;
let controls = null;
let currentObjectUrl = null;

function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function setProgress(value, label) {
    progressFill.style.width = `${value}%`;
    progressFill.setAttribute('aria-valuenow', String(value));
    progressLabel.textContent = label;
}

function renderFiles(files) {
    if (!files.length) {
        fileList.innerHTML = '<li class="file-list__empty">No files selected yet.</li>';
        return;
    }

    fileList.innerHTML = files
        .map((file) => `
            <li class="file-item">
                <span class="file-item__name">${file.name}</span>
                <span class="file-item__meta">${formatFileSize(file.size)} • ${file.type || 'Unknown type'}</span>
            </li>
        `)
        .join('');
}

function isSupportedFile(file) {
    const fileName = file.name.toLowerCase();
    return fileName.endsWith('.obj') || fileName.endsWith('.stl') || fileName.endsWith('.ply') || fileName.endsWith('.glb') || fileName.endsWith('.gltf') || fileName.endsWith('.3mf');
}

function clearSceneModel() {
    if (currentModel) {
        scene.remove(currentModel);
        currentModel.traverse((child) => {
            if (child.isMesh) {
                child.geometry?.dispose();
                if (Array.isArray(child.material)) {
                    child.material.forEach((material) => material.dispose());
                } else if (child.material) {
                    child.material.dispose();
                }
            }
        });
        currentModel = null;
    }
}

function initPreview() {
    const canvas = document.getElementById('previewCanvas');
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07111f);

    camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
    camera.position.set(0, 1.6, 4.0);

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = true;
    controls.rotateSpeed = 0.7;
    controls.zoomSpeed = 0.8;
    controls.panSpeed = 0.8;
    controls.target.set(0, 0, 0);

    const ambient = new THREE.AmbientLight(0xffffff, 0.95);
    scene.add(ambient);

    const directional = new THREE.DirectionalLight(0xffffff, 1.35);
    directional.position.set(4, 6, 5);
    scene.add(directional);

    const grid = new THREE.GridHelper(10, 10, 0x6ea8ff, 0x2b3e59);
    grid.position.y = -0.01;
    scene.add(grid);

    const floor = new THREE.Mesh(
        new THREE.CylinderGeometry(2.2, 2.2, 0.05, 48),
        new THREE.MeshStandardMaterial({ color: 0x14253b, roughness: 0.7, metalness: 0.2 })
    );
    floor.position.y = -0.03;
    scene.add(floor);

    const animate = () => {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    };
    animate();

    window.addEventListener('resize', () => {
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    });
}

function fitObjectToView(object) {
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;

    object.position.sub(center);
    object.scale.setScalar(2.2 / maxDim);
    object.position.set(0, 0, 0);
    controls.target.set(0, 0, 0);
    camera.position.set(0, 1.6, Math.max(3.2, 2.5 * maxDim));
    camera.lookAt(0, 0, 0);
    controls.update();
}

function showModel(object) {
    clearSceneModel();
    currentModel = object;
    scene.add(object);
    fitObjectToView(object);
}

function createMeshFromTriangles(vertices, indices) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    if (indices.length) {
        geometry.setIndex(indices);
    }
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({ color: 0x6ea8ff, roughness: 0.4, metalness: 0.1 });
    return new THREE.Mesh(geometry, material);
}

function getElementsByLocalName(node, localName) {
    return Array.from(node.getElementsByTagName('*')).filter((child) => child.localName === localName);
}

async function load3mfModel(file) {
    const zip = await JSZip.loadAsync(file);
    const modelEntry = Object.values(zip.files).find((entry) => !entry.dir && entry.name.toLowerCase().endsWith('.model'));
    if (!modelEntry) {
        throw new Error('No 3MF model content was found inside the archive.');
    }

    const xmlText = await modelEntry.async('text');
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlText, 'application/xml');
    const objects = Array.from(xml.getElementsByTagName('*')).filter((node) => node.localName === 'object');
    const group = new THREE.Group();

    objects.forEach((objectNode) => {
        const meshNode = getElementsByLocalName(objectNode, 'mesh')[0];
        if (!meshNode) return;

        const vertices = getElementsByLocalName(meshNode, 'vertex').map((vertexNode) => ({
            x: parseFloat(vertexNode.getAttribute('x') || '0'),
            y: parseFloat(vertexNode.getAttribute('y') || '0'),
            z: parseFloat(vertexNode.getAttribute('z') || '0')
        }));

        const triangles = getElementsByLocalName(meshNode, 'triangle').map((triangleNode) => [
            parseInt(triangleNode.getAttribute('v1') || '0', 10),
            parseInt(triangleNode.getAttribute('v2') || '0', 10),
            parseInt(triangleNode.getAttribute('v3') || '0', 10)
        ]);

        if (!vertices.length || !triangles.length) return;

        const flattenedVertices = [];
        const indexedVertices = [];
        vertices.forEach((vertex) => {
            flattenedVertices.push(vertex.x, vertex.y, vertex.z);
        });

        triangles.forEach((triangle) => {
            indexedVertices.push(...triangle);
        });

        const mesh = createMeshFromTriangles(flattenedVertices, indexedVertices);
        group.add(mesh);
    });

    if (!group.children.length) {
        throw new Error('The 3MF archive did not contain readable triangle data.');
    }

    return group;
}

async function loadModelFromFile(file) {
    const fileName = file.name.toLowerCase();

    setProgress(25, 'Loading model');
    previewStatus.textContent = 'Loading preview';

    try {
        if (fileName.endsWith('.3mf')) {
            const model = await load3mfModel(file);
            showModel(model);
            previewStatus.textContent = 'Preview ready';
            setProgress(100, 'Ready to convert');
            summaryText.textContent = `${file.name} • Output: ${outputFormat.value.toUpperCase()} • Ready for conversion`;
            return;
        }

        if (fileName.endsWith('.obj')) {
            const text = await file.text();
            const object = new OBJLoader().parse(text);
            showModel(object);
            previewStatus.textContent = 'Preview ready';
            setProgress(100, 'Ready to convert');
            summaryText.textContent = `${file.name} • Output: ${outputFormat.value.toUpperCase()} • Ready for conversion`;
            return;
        }

        if (fileName.endsWith('.stl')) {
            const arrayBuffer = await file.arrayBuffer();
            const geometry = new STLLoader().parse(arrayBuffer);
            const material = new THREE.MeshStandardMaterial({ color: 0x6ea8ff, roughness: 0.4, metalness: 0.1 });
            const mesh = new THREE.Mesh(geometry, material);
            showModel(mesh);
            previewStatus.textContent = 'Preview ready';
            setProgress(100, 'Ready to convert');
            summaryText.textContent = `${file.name} • Output: ${outputFormat.value.toUpperCase()} • Ready for conversion`;
            return;
        }

        if (fileName.endsWith('.ply')) {
            const arrayBuffer = await file.arrayBuffer();
            const geometry = new PLYLoader().parse(arrayBuffer);
            const material = new THREE.MeshStandardMaterial({ color: 0x6ea8ff, roughness: 0.4, metalness: 0.1 });
            const mesh = new THREE.Mesh(geometry, material);
            showModel(mesh);
            previewStatus.textContent = 'Preview ready';
            setProgress(100, 'Ready to convert');
            summaryText.textContent = `${file.name} • Output: ${outputFormat.value.toUpperCase()} • Ready for conversion`;
            return;
        }

        if (fileName.endsWith('.gltf') || fileName.endsWith('.glb')) {
            const arrayBuffer = await file.arrayBuffer();
            const gltf = await new Promise((resolve, reject) => {
                new GLTFLoader().parse(arrayBuffer, '', resolve, reject);
            });
            showModel(gltf.scene);
            previewStatus.textContent = 'Preview ready';
            setProgress(100, 'Ready to convert');
            summaryText.textContent = `${file.name} • Output: ${outputFormat.value.toUpperCase()} • Ready for conversion`;
            return;
        }

        throw new Error('This file type is not supported in the real conversion workflow.');
    } catch (error) {
        previewStatus.textContent = 'Load failed';
        setProgress(0, 'Ready');
        console.error(error);
    }
}

function collectMeshes(object3d) {
    const meshes = [];
    object3d.traverse((child) => {
        if (child.isMesh && child.geometry) {
            const geometry = child.geometry.clone();
            geometry.applyMatrix4(child.matrixWorld);
            meshes.push(geometry);
        }
    });
    return meshes;
}

function exportAsStl(model) {
    const geometries = collectMeshes(model);
    let output = 'solid converted_model\n';

    geometries.forEach((geometry) => {
        const position = geometry.attributes.position;
        const index = geometry.index;
        const triangleCount = index ? index.count / 3 : position.count / 3;

        for (let i = 0; i < triangleCount; i += 1) {
            const a = index ? index.getX(i * 3) : i * 3;
            const b = index ? index.getX(i * 3 + 1) : i * 3 + 1;
            const c = index ? index.getX(i * 3 + 2) : i * 3 + 2;

            const v1 = new THREE.Vector3(position.getX(a), position.getY(a), position.getZ(a));
            const v2 = new THREE.Vector3(position.getX(b), position.getY(b), position.getZ(b));
            const v3 = new THREE.Vector3(position.getX(c), position.getY(c), position.getZ(c));
            const normal = new THREE.Vector3().crossVectors(v2.clone().sub(v1), v3.clone().sub(v1)).normalize();

            output += `  facet normal ${normal.x.toFixed(6)} ${normal.y.toFixed(6)} ${normal.z.toFixed(6)}\n`;
            output += '    outer loop\n';
            output += `      vertex ${v1.x.toFixed(6)} ${v1.y.toFixed(6)} ${v1.z.toFixed(6)}\n`;
            output += `      vertex ${v2.x.toFixed(6)} ${v2.y.toFixed(6)} ${v2.z.toFixed(6)}\n`;
            output += `      vertex ${v3.x.toFixed(6)} ${v3.y.toFixed(6)} ${v3.z.toFixed(6)}\n`;
            output += '    endloop\n';
            output += '  endfacet\n';
        }
    });

    output += 'endsolid converted_model\n';
    return output;
}

function exportAsStep(model) {
    const geometries = collectMeshes(model);
    const points = [];
    const faces = [];

    geometries.forEach((geometry) => {
        const position = geometry.attributes.position;
        const index = geometry.index;
        const triangleCount = index ? index.count / 3 : position.count / 3;

        for (let i = 0; i < triangleCount; i += 1) {
            const a = index ? index.getX(i * 3) : i * 3;
            const b = index ? index.getX(i * 3 + 1) : i * 3 + 1;
            const c = index ? index.getX(i * 3 + 2) : i * 3 + 2;

            const v1 = new THREE.Vector3(position.getX(a), position.getY(a), position.getZ(a));
            const v2 = new THREE.Vector3(position.getX(b), position.getY(b), position.getZ(b));
            const v3 = new THREE.Vector3(position.getX(c), position.getY(c), position.getZ(c));

            const pointIds = [v1, v2, v3].map((point) => {
                const existingIndex = points.findIndex((candidate) => candidate.distanceTo(point) < 1e-6);
                if (existingIndex >= 0) {
                    return existingIndex + 1;
                }
                points.push(point);
                return points.length;
            });

            faces.push(pointIds);
        }
    });

    const lines = [
        'ISO-10303-21;',
        'HEADER;',
        "FILE_DESCRIPTION(('Converted 3D model'),'2;1');",
        "FILE_NAME('converted-model.step','2026-07-20T00:00:00',('convert3d'),('convert3d'),'convert3d','convert3d',' ');",
        "FILE_SCHEMA(('CONFIG_CONTROL_DESIGN'));",
        'ENDSEC;',
        'DATA;'
    ];

    points.forEach((point, index) => {
        lines.push(`#${index + 1}=CARTESIAN_POINT('',(${point.x.toFixed(6)},${point.y.toFixed(6)},${point.z.toFixed(6)}));`);
    });

    faces.forEach((face, index) => {
        lines.push(`#${points.length + index + 1}=TRIANGULAR_FACE('',#${face[0]},#${face[1]},#${face[2]});`);
    });

    lines.push('ENDSEC;');
    lines.push('END-ISO-10303-21;');
    return lines.join('\n');
}

function handleFiles(files) {
    const incomingFiles = Array.from(files || []);
    const supportedFiles = incomingFiles.filter(isSupportedFile);
    const unsupportedFiles = incomingFiles.filter((file) => !isSupportedFile(file));

    selectedFiles = supportedFiles.length ? supportedFiles : incomingFiles;
    renderFiles(selectedFiles);

    if (incomingFiles.length === 0) {
        dropTitle.textContent = 'Choose a supported 3D file';
        summaryText.textContent = 'No model selected yet. Choose a file to begin.';
    } else if (supportedFiles.length > 0) {
        dropTitle.textContent = 'Upload complete';
        summaryText.textContent = `${supportedFiles[0].name} • Output: ${outputFormat.value.toUpperCase()} • Ready for conversion`;
    } else {
        dropTitle.textContent = 'Upload complete';
        summaryText.textContent = `${incomingFiles[0].name} • Waiting for a supported 3D model`;
    }

    convertBtn.disabled = supportedFiles.length === 0;
    setProgress(0, supportedFiles.length ? 'Ready' : 'Ready');
}

function showPickerFallback() {
    dropTitle.textContent = 'Picker did not return a file';
    fileList.innerHTML = '<li class="file-list__empty">No file was received from the picker.</li>';
}

if (browseBtn) {
    browseBtn.addEventListener('click', (event) => {
        event.preventDefault();
        fileInput.click();
    });
}

if (uploadBox) {
    ['dragenter', 'dragover'].forEach((eventName) => {
        uploadBox.addEventListener(eventName, (event) => {
            event.preventDefault();
            uploadBox.classList.add('is-dragging');
        });
    });

    ['dragleave', 'dragend', 'drop'].forEach((eventName) => {
        uploadBox.addEventListener(eventName, (event) => {
            event.preventDefault();
            uploadBox.classList.remove('is-dragging');
        });
    });

    uploadBox.addEventListener('drop', async (event) => {
        const files = Array.from(event.dataTransfer?.files || []);
        if (!files.length) {
            return;
        }

        dropTitle.textContent = 'Upload complete';
        summaryText.textContent = `${files[0].name} • Upload received`;

        handleFiles(files);

        const supportedFile = files.find((file) => isSupportedFile(file));
        if (supportedFile) {
            await loadModelFromFile(supportedFile);
        } else {
            previewStatus.textContent = 'Unsupported format';
            setProgress(0, 'Ready');
        }
    });
}

const onFileInput = async () => {
    const files = Array.from(fileInput.files || []);

    if (!files.length) {
        showPickerFallback();
        return;
    }

    dropTitle.textContent = 'Input changed';
    summaryText.textContent = `${files[0].name} • Upload received`;

    dropTitle.textContent = 'Upload complete';
    summaryText.textContent = `${files[0].name} • Upload received`;

    handleFiles(files);

    const supportedFile = files.find((file) => isSupportedFile(file));
    if (supportedFile) {
        await loadModelFromFile(supportedFile);
    } else {
        previewStatus.textContent = 'Unsupported format';
        setProgress(0, 'Ready');
    }

    fileInput.value = '';
};

fileInput.addEventListener('change', onFileInput);

outputFormat.addEventListener('change', () => {
    if (selectedFiles.length) {
        summaryText.textContent = `${selectedFiles[0].name} • Output: ${outputFormat.value.toUpperCase()} • Ready for conversion`;
    }
});

convertBtn.addEventListener('click', () => {
    if (!selectedFiles.length || !currentModel) {
        return;
    }

    const sourceFile = selectedFiles[0];
    const targetFormat = outputFormat.value.toLowerCase();
    const baseName = sourceFile.name.replace(/\.[^.]+$/, '') || 'converted-model';
    const downloadName = `${baseName}.${targetFormat}`;

    convertBtn.disabled = true;
    setProgress(10, 'Preparing export');
    previewStatus.textContent = 'Exporting model';

    try {
        let blob;
        if (targetFormat === 'stl') {
            blob = new Blob([exportAsStl(currentModel)], { type: 'model/stl' });
        } else if (targetFormat === 'step') {
            blob = new Blob([exportAsStep(currentModel)], { type: 'text/plain' });
        } else {
            const exporter = new GLTFExporter();
            const exportOptions = { binary: targetFormat === 'glb' };
            exporter.parse(
                currentModel,
                (result) => {
                    if (targetFormat === 'glb') {
                        blob = new Blob([result], { type: 'model/gltf-binary' });
                    } else {
                        blob = new Blob([JSON.stringify(result, null, 2)], { type: 'model/gltf+json' });
                    }

                    const href = URL.createObjectURL(blob);
                    downloadLink.href = href;
                    downloadLink.download = downloadName;
                    downloadLink.textContent = `Download ${downloadName}`;
                    downloadLink.hidden = false;

                    previewStatus.textContent = 'Export complete';
                    summaryText.textContent = `${sourceFile.name} • Output: ${targetFormat.toUpperCase()} • Export complete`;
                    setProgress(100, 'Exported');
                    convertBtn.disabled = false;
                },
                (error) => {
                    throw error;
                },
                exportOptions
            );
            return;
        }

        const href = URL.createObjectURL(blob);
        downloadLink.href = href;
        downloadLink.download = downloadName;
        downloadLink.textContent = `Download ${downloadName}`;
        downloadLink.hidden = false;

        previewStatus.textContent = 'Export complete';
        summaryText.textContent = `${sourceFile.name} • Output: ${targetFormat.toUpperCase()} • Export complete`;
        setProgress(100, 'Exported');
    } catch (error) {
        previewStatus.textContent = 'Export failed';
        setProgress(0, 'Ready');
        console.error(error);
    } finally {
        convertBtn.disabled = false;
    }
});

setProgress(0, 'Ready');
summaryText.textContent = 'No model selected yet. Choose a file to begin.';
initPreview();
