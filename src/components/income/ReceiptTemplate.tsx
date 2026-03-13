import React from 'react';
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Receipt, CreditCard, Wallet, Calendar, User } from 'lucide-react';

interface ReceiptTemplateProps {
  payment: {
    client_name: string;
    parent_service: string;
    selected_services: Array<{ title: string, price: number }>;
    date: string;
    amount: number;
    payment_method: string;
  };
}

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0
  }).format(val);
};

export const ReceiptTemplate = React.forwardRef<HTMLDivElement, ReceiptTemplateProps>(({ payment }, ref) => {
  return (
    <div 
      ref={ref}
      style={{
        width: '500px',
        backgroundColor: '#050505',
        color: '#f5f5f0',
        padding: '40px',
        fontFamily: 'serif',
        border: '1px solid #c29a5b30',
        borderRadius: '24px',
        position: 'fixed',
        left: '-5000px', // Far off-screen but still 'visible' for capture
        top: '0',
        zIndex: -100,
      }}
    >
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <div style={{ 
          display: 'inline-flex', 
          padding: '12px', 
          backgroundColor: '#c29a5b10', 
          borderRadius: '16px', 
          border: '1px solid #c29a5b30',
          marginBottom: '16px' 
        }}>
          <Receipt style={{ width: '32px', height: '32px', color: '#c29a5b' }} />
        </div>
        <h1 style={{ fontSize: '28px', color: '#f5f5f0', margin: '0 0 4px 0', letterSpacing: '0.05em' }}>KÂLON</h1>
        <p style={{ fontSize: '12px', color: '#c29a5b', textTransform: 'uppercase', fontStyle: 'italic', letterSpacing: '0.2em', margin: 0 }}>Estética & Bienestar</p>
      </div>

      {/* Main Info */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <p style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: '900', letterSpacing: '0.2em', color: '#c29a5b80', margin: 0 }}>Cliente</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <User style={{ width: '12px', height: '12px', color: '#c29a5b40' }} />
            <p style={{ fontSize: '16px', fontWeight: 'bold', margin: 0 }}>{payment.client_name}</p>
          </div>
        </div>
        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <p style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: '900', letterSpacing: '0.2em', color: '#c29a5b80', margin: 0 }}>Fecha</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
            <Calendar style={{ width: '12px', height: '12px', color: '#c29a5b40' }} />
            <p style={{ fontSize: '14px', color: '#f5f5f0cc', fontWeight: '600', margin: 0 }}>
              {format(new Date(payment.date), "dd/MM/yyyy HH:mm")}
            </p>
          </div>
        </div>
      </div>

      {/* Services Breakdown */}
      <div style={{ marginBottom: '32px' }}>
        <p style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: '900', letterSpacing: '0.2em', color: '#c29a5b80', marginBottom: '16px' }}>Detalle de Servicios</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {payment.selected_services?.map((service, idx) => (
            <div 
              key={idx} 
              style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                padding: '16px', 
                backgroundColor: '#ffffff05', 
                borderRadius: '16px', 
                border: '1px solid #ffffff05' 
              }}
            >
              <span style={{ fontSize: '14px', fontWeight: '500', color: '#f5f5f0cc' }}>{service.title}</span>
              <span style={{ fontSize: '14px', fontWeight: '900', color: '#c29a5b', fontFamily: 'monospace' }}>{formatCurrency(service.price)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Total Footer */}
      <div style={{ paddingTop: '24px', borderTop: '1px solid #ffffff05' }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          backgroundColor: '#c29a5b10', 
          padding: '20px', 
          borderRadius: '20px', 
          border: '1px solid #c29a5b20',
          marginBottom: '16px'
        }}>
          <span style={{ fontSize: '14px', textTransform: 'uppercase', fontWeight: '900', letterSpacing: '0.2em', color: '#c29a5b' }}>Total Abonado</span>
          <span style={{ fontSize: '24px', fontWeight: '900', color: '#c29a5b' }}>{formatCurrency(payment.amount)}</span>
        </div>
        
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '8px', 
          justifyContent: 'center', 
          fontSize: '10px', 
          textTransform: 'uppercase', 
          fontWeight: '900', 
          letterSpacing: '0.1em', 
          color: '#f5f5f030' 
        }}>
          {payment.payment_method === 'Efectivo' ? (
            <>
              <Wallet style={{ width: '12px', height: '12px' }} />
              Pago vía Efectivo
            </>
          ) : (
            <>
              <CreditCard style={{ width: '12px', height: '12px' }} />
              Pago vía {payment.payment_method}
            </>
          )}
        </div>
      </div>

      {/* Aesthetic Footer Note */}
      <div style={{ textAlign: 'center', marginTop: '40px' }}>
        <p style={{ fontSize: '11px', color: '#c29a5b', fontStyle: 'italic', margin: 0, opacity: 0.6 }}>¡Gracias por elegir la experiencia Kâlon!</p>
        <p style={{ fontSize: '9px', color: '#ffffff20', textTransform: 'uppercase', marginTop: '8px', letterSpacing: '0.1em' }}>Comprobante Digital Válido para Kâlon Estética</p>
      </div>
    </div>
  );
});

ReceiptTemplate.displayName = 'ReceiptTemplate';
