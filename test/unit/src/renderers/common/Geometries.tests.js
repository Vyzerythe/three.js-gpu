import Geometries from '../../../../../src/renderers/common/Geometries.js';
import { BufferGeometry } from '../../../../../src/core/BufferGeometry.js';
import { BufferAttribute } from '../../../../../src/core/BufferAttribute.js';
import { InterleavedBuffer } from '../../../../../src/core/InterleavedBuffer.js';
import { InterleavedBufferAttribute } from '../../../../../src/core/InterleavedBufferAttribute.js';

function createGeometries() {

	const deleted = [];

	const backend = {
		getBufferAttribute: ( attribute ) => attribute.isInterleavedBufferAttribute ? attribute.data : attribute
	};

	const attributes = {
		delete: ( attribute ) => deleted.push( attribute )
	};

	const info = { memory: { geometries: 0 } };

	return { geometries: new Geometries( backend, attributes, info ), deleted };

}

function deletedExactly( deleted, expected ) {

	return deleted.length === expected.length && expected.every( ( attribute ) => deleted.includes( attribute ) );

}

export default QUnit.module( 'Renderers', () => {

	QUnit.module( 'Common', () => {

		QUnit.module( 'Geometries', () => {

			QUnit.test( 'dispose', ( assert ) => {

				const { geometries, deleted } = createGeometries();

				const index = new BufferAttribute( new Uint16Array( 3 ), 1 );
				const position = new BufferAttribute( new Float32Array( 9 ), 3 );
				const normal = new BufferAttribute( new Float32Array( 9 ), 3 );

				const geometryA = new BufferGeometry();
				geometryA.setIndex( index );
				geometryA.setAttribute( 'position', position );
				geometryA.setAttribute( 'normal', normal );

				const geometryB = new BufferGeometry();
				geometryB.setIndex( index );
				geometryB.setAttribute( 'position', position );

				geometries.initGeometry( geometryA );
				geometries.initGeometry( geometryB );

				geometryA.dispose();

				assert.ok( deletedExactly( deleted, [ normal ] ), 'Attributes used by another geometry are not deleted.' );

				geometryB.dispose();

				assert.ok( deletedExactly( deleted, [ normal, index, position ] ), 'Shared attributes are deleted with the last geometry using them.' );

			} );

			QUnit.test( 'dispose (interleaved attributes)', ( assert ) => {

				const { geometries, deleted } = createGeometries();

				const interleavedBuffer = new InterleavedBuffer( new Float32Array( 18 ), 6 );

				const geometryA = new BufferGeometry();
				geometryA.setAttribute( 'position', new InterleavedBufferAttribute( interleavedBuffer, 3, 0 ) );
				geometryA.setAttribute( 'normal', new InterleavedBufferAttribute( interleavedBuffer, 3, 3 ) );

				const geometryB = new BufferGeometry();
				geometryB.setAttribute( 'position', new InterleavedBufferAttribute( interleavedBuffer, 3, 0 ) );

				geometries.initGeometry( geometryA );
				geometries.initGeometry( geometryB );

				geometryA.dispose();

				assert.ok( deletedExactly( deleted, [] ), 'An interleaved buffer used by another geometry is not deleted.' );

				geometryB.dispose();

				assert.ok( deletedExactly( deleted, [ interleavedBuffer ] ), 'An interleaved buffer is deleted with the last geometry using it.' );

			} );

			QUnit.test( 'dispose (attributes assigned after initialization)', ( assert ) => {

				const { geometries, deleted } = createGeometries();

				const position = new BufferAttribute( new Float32Array( 9 ), 3 );
				const uv = new BufferAttribute( new Float32Array( 6 ), 2 );

				const geometryA = new BufferGeometry();
				geometryA.setAttribute( 'position', new BufferAttribute( new Float32Array( 9 ), 3 ) );

				const geometryB = new BufferGeometry();
				geometryB.setAttribute( 'position', position );

				geometries.initGeometry( geometryA );
				geometries.initGeometry( geometryB );

				const replacedPosition = geometryA.getAttribute( 'position' );

				geometryA.setAttribute( 'position', position );
				geometryA.setAttribute( 'uv', uv );

				geometryA.dispose();

				assert.ok( deletedExactly( deleted, [ replacedPosition, uv ] ), 'Attributes no other geometry uses are deleted.' );

				geometryB.dispose();

				assert.ok( deletedExactly( deleted, [ replacedPosition, uv, position ] ), 'An attribute is deleted with the last geometry using it.' );

			} );

		} );

	} );

} );
