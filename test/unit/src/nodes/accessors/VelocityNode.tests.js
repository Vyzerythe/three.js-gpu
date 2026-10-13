import VelocityNode from '../../../../../src/nodes/accessors/VelocityNode.js';
import { PerspectiveCamera } from '../../../../../src/cameras/PerspectiveCamera.js';
import { Object3D } from '../../../../../src/core/Object3D.js';

function createCamera( fov, x, y, z ) {

	const camera = new PerspectiveCamera( fov, 1, 0.1, 100 );
	camera.position.set( x, y, z );
	camera.lookAt( 0, 0, 0 );
	camera.updateMatrixWorld();

	return camera;

}

function usesCamera( node, camera ) {

	return node.currentProjectionMatrix.value.equals( camera.projectionMatrix ) &&
		node.previousProjectionMatrix.value.equals( camera.projectionMatrix ) &&
		node.previousCameraViewMatrix.value.equals( camera.matrixWorldInverse );

}

export default QUnit.module( 'Nodes', () => {

	QUnit.module( 'Accessors', () => {

		QUnit.module( 'VelocityNode', () => {

			QUnit.test( 'update (several nodes)', ( assert ) => {

				const camera = createCamera( 50, 1, 2, 5 );
				const object = new Object3D();

				const velocityA = new VelocityNode();
				const velocityB = new VelocityNode();

				velocityA.update( { frameId: 1, camera, object } );
				velocityB.update( { frameId: 1, camera, object } );

				assert.ok( usesCamera( velocityA, camera ), 'The first node updated in a frame uses the camera matrices.' );
				assert.ok( usesCamera( velocityB, camera ), 'Further nodes updated in the same frame use the camera matrices.' );

			} );

			QUnit.test( 'update (several cameras)', ( assert ) => {

				const cameraA = createCamera( 50, 1, 2, 5 );
				const cameraB = createCamera( 70, - 2, 0, 4 );
				const object = new Object3D();

				const velocity = new VelocityNode();

				velocity.update( { frameId: 1, camera: cameraA, object } );
				velocity.update( { frameId: 1, camera: cameraB, object } );
				velocity.update( { frameId: 1, camera: cameraA, object } );

				assert.ok( usesCamera( velocity, cameraA ), 'A camera rendered again in the same frame uses its own matrices.' );

			} );

		} );

	} );

} );
