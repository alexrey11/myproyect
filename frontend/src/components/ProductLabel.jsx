import React, { forwardRef } from 'react';

const ProductLabel = forwardRef(({ product }, ref) => {
    return (
        <div ref={ref} className="w-64 h-40 bg-white border-2 border-gray-300 rounded-lg p-3 flex flex-col items-center justify-center text-center" style={{ fontFamily: 'monospace' }}>
            <div className="text-xs text-gray-500">SKU: {product.sku || 'N/A'}</div>
            <div className="text-base font-bold my-1 text-gray-800">{product.name}</div>
            <div className="text-xl font-bold text-blue-600">${product.price?.toFixed(2) || '0.00'}</div>
            <div className="text-xs text-gray-500">Stock: {product.stock}</div>
            {/* Código de barras simulado (puedes usar una librería real si quieres) */}
            <div className="w-full flex justify-center mt-1">
                <div className="bg-black" style={{ width: '60%', height: '2px' }}></div>
            </div>
            <div className="w-full flex justify-center">
                <div className="bg-black" style={{ width: '40%', height: '2px' }}></div>
            </div>
        </div>
    );
});

export default ProductLabel;