import React, { forwardRef } from 'react';

const Ticket = forwardRef(({ sale, storeName = 'Tecopos Plus', storePhone = '555-0000' }, ref) => {
    return (
        <div ref={ref} className="p-6 max-w-xs mx-auto bg-white text-black" style={{ fontFamily: 'monospace', fontSize: '12px' }}>
            <div className="text-center border-b border-dashed pb-2">
                <h2 className="text-lg font-bold">{storeName}</h2>
                <p className="text-sm">{storePhone}</p>
                <p className="text-xs mt-1">Ticket #{sale.id}</p>
                <p className="text-xs">{new Date(sale.date).toLocaleString()}</p>
            </div>

            <div className="py-2 border-b border-dashed">
                <p className="text-xs">Cliente: {sale.customer_name}</p>
                {sale.customer_phone && <p className="text-xs">Tel: {sale.customer_phone}</p>}
                <p className="text-xs">Método: {sale.payment_method}</p>
                {sale.transaction_id && <p className="text-xs">Transacción: {sale.transaction_id}</p>}
            </div>

            <table className="w-full text-xs my-2 border-b border-dashed">
                <thead>
                    <tr>
                        <th className="text-left">Producto</th>
                        <th className="text-center">Cant</th>
                        <th className="text-right">Precio</th>
                        <th className="text-right">Subtotal</th>
                    </tr>
                </thead>
                <tbody>
                    {sale.items && sale.items.map((item, idx) => (
                        <tr key={idx}>
                            <td className="text-left">{item.product_name}</td>
                            <td className="text-center">{item.quantity}</td>
                            <td className="text-right">${item.price.toFixed(2)}</td>
                            <td className="text-right">${(item.quantity * item.price).toFixed(2)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div className="flex justify-between font-bold text-sm border-t border-dashed pt-2">
                <span>TOTAL</span>
                <span>{sale.currency || 'CUP'} ${sale.total.toFixed(2)}</span>
            </div>

            <div className="text-center text-xs text-gray-500 border-t border-dashed mt-2 pt-2">
                <p>¡Gracias por su compra!</p>
                <p>Vuelva pronto</p>
            </div>
        </div>
    );
});

export default Ticket;