import React from 'react';
import { FileText, Filter, CreditCard, Wallet } from 'lucide-react';

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
  // Use a stable date to avoid hydration mismatches or errors with invalid dates
  const displayDate = React.useMemo(() => {
    try {
      return new Intl.DateTimeFormat('es-AR', { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit', 
        timeZone: 'America/Argentina/Cordoba' 
      }).format(new Date(payment.date));
    } catch (e) {
      return new Intl.DateTimeFormat('es-AR', { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit', 
        timeZone: 'America/Argentina/Cordoba' 
      }).format(new Date());
    }
  }, [payment.date]);

  return (
    <div 
      ref={ref}
      style={{
        width: '500px',
        backgroundColor: '#1a1814', // Specific dark brown from screenshot
        color: '#f5f5f0',
        padding: '50px 40px',
        fontFamily: "'Playfair Display', serif",
        boxSizing: 'border-box'
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '60px' }}>
        <FileText style={{ width: '30px', height: '30px', color: '#c29a5b' }} />
        <h1 style={{ fontSize: '36px', fontWeight: 'bold', margin: 0, fontStyle: 'italic', letterSpacing: '-0.02em' }}>
          Detalle de Transacción
        </h1>
      </div>

      {/* Info Rows */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '40px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <p style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: '900', letterSpacing: '0.15em', color: '#c29a5b80', margin: 0 }}>Cliente</p>
          <p style={{ fontSize: '24px', fontWeight: 'bold', margin: 0, letterSpacing: '0.02em' }}>{payment.client_name}</p>
        </div>
        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <p style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: '900', letterSpacing: '0.15em', color: '#c29a5b80', margin: 0 }}>Fecha</p>
          <p style={{ fontSize: '18px', fontWeight: 'bold', margin: 0, color: '#f5f5f0cc' }}>{displayDate}</p>
        </div>
      </div>

      {/* Services Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
        <Filter style={{ width: '14px', height: '14px', color: '#c29a5b' }} />
        <p style={{ fontSize: '12px', textTransform: 'uppercase', fontWeight: '900', letterSpacing: '0.2em', color: '#c29a5b', margin: 0 }}>
          Desglose de Servicios
        </p>
      </div>

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '50px' }}>
        {payment.selected_services?.map((service, idx) => (
          <div 
            key={idx} 
            style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              padding: '24px 28px', 
              backgroundColor: '#ffffff07', 
              borderRadius: '24px', 
              border: '1px solid #ffffff05',
              gap: '20px'
            }}
          >
            <span style={{ fontSize: '17px', fontWeight: '600', color: '#f5f5f0dd', flex: 1 }}>{service.title}</span>
            <span style={{ 
              fontSize: '17px', 
              fontWeight: '900', 
              color: '#c29a5b', 
              whiteSpace: 'nowrap',
              textAlign: 'right'
            }}>
              $ {service.price.toLocaleString('es-AR')}
            </span>
          </div>
        ))}
      </div>

      {/* Total Card */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        backgroundColor: '#26221b', 
        padding: '30px 35px', 
        borderRadius: '28px', 
        border: '1px solid #c29a5b20',
        marginBottom: '30px',
        gap: '20px'
      }}>
        <span style={{ fontSize: '18px', textTransform: 'uppercase', fontWeight: '900', letterSpacing: '0.2em', color: '#c29a5b' }}>Total Abonado</span>
        <span style={{ 
          fontSize: '38px', 
          fontWeight: 'bold', 
          color: '#c29a5b', 
          fontStyle: 'italic',
          whiteSpace: 'nowrap',
          textAlign: 'right'
        }}>
          $ {payment.amount.toLocaleString('es-AR')}
        </span>
      </div>

      {/* Method Footer */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '12px', 
        justifyContent: 'center', 
        fontSize: '13px', 
        textTransform: 'uppercase', 
        fontWeight: '900', 
        letterSpacing: '0.15em', 
        color: '#f5f5f040' 
      }}>
        {payment.payment_method === 'Efectivo' ? (
          <>
            <Wallet style={{ width: '16px', height: '16px' }} />
            Pago vía Efectivo
          </>
        ) : (
          <>
            <CreditCard style={{ width: '16px', height: '16px' }} />
            Pago vía {payment.payment_method}
          </>
        )}
      </div>
    </div>
  );
});

ReceiptTemplate.displayName = 'ReceiptTemplate';
