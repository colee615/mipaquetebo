# MANUAL DE USUARIO - TrackingBo App

## 1. Introduccion
TrackingBo App es una aplicacion movil para consultar el estado de envios postales mediante codigo de rastreo. Permite escanear un codigo con camara o escribirlo manualmente para ver el historial de movimientos del paquete.

Usuarios esperados:
- Cliente final: consulta y seguimiento de su paquete.
- Operador de atencion: apoyo al cliente en consultas de estado.
- Cartero o personal logistico: verificacion rapida de estados de entrega.

Nota: En esta version no existe inicio de sesion por roles. Todas las personas usan las mismas pantallas y funciones.

## 2. Acceso al sistema
Forma de acceso:
1. Instale la aplicacion movil TrackingBo App en Android (APK o build publicada).
2. Abra la aplicacion desde el icono en su telefono.
3. Espere la pantalla de carga (aprox. 2 segundos).
4. El sistema abre automaticamente la pantalla principal "Buscar envio".

Permisos al iniciar:
- Camara: necesaria para escanear codigos.
- Notificaciones: recomendada para recibir cambios de estado.

No se solicita usuario ni contrasena en esta version.

## 3. Interfaz principal
Pantalla principal: "Buscar envio".

Captura sugerida: pantalla principal completa mostrando:
- Cabecera (idioma ES/EN y cambio claro/oscuro).
- Boton "Escanear con camara".
- Campo "Ingresar codigo".
- Boton "Consultar".
- Boton "Ver guardados".

Descripcion de secciones:
- Selector de idioma: cambia entre espanol e ingles.
- Boton de tema: cambia visual claro/oscuro.
- Seccion Escanear: abre la camara para leer QR/codigo de barras.
- Seccion Ingresar codigo: consulta manual del envio.
- Ver guardados: abre lista de paquetes pendientes guardados.

## 4. Flujos de uso por rol

### 4.1 Cliente final
Puede hacer:
- Consultar estado de envio.
- Guardar paquete con nombre personalizado.
- Ver historial de eventos.
- Administrar lista de guardados.
- Ver paquetes entregados.

### 4.2 Operador de atencion
Puede hacer:
- Buscar por codigo frente al cliente.
- Validar ultimo evento y oficina.
- Renombrar paquetes para identificar casos.
- Actualizar lista para verificar cambios recientes.

### 4.3 Cartero/personal logistico
Puede hacer:
- Comprobar eventos de entrega.
- Revisar si un paquete figura como entregado.
- Consultar origen/destino y progreso.

## 5. Funciones del sistema (captura + descripcion + pasos + resultado)

### Funcion 1: Consultar con camara
Captura: pantalla "Buscar envio" + pantalla de camara con marco de escaneo.

Descripcion:
Permite leer automaticamente el codigo del paquete usando la camara.

Pasos:
1. Pulse "Escanear con camara".
2. Si se solicita permiso, permita acceso a camara.
3. Enfoque el codigo dentro del marco.
4. Espere la lectura automatica.
5. Si el paquete no estaba guardado, el sistema pedira un nombre opcional antes de mostrar eventos.

Resultado esperado:
- Se abre "Resultado" con estado, progreso e historial del envio.

### Funcion 2: Consultar ingresando codigo
Captura: pantalla "Buscar envio" mostrando campo de texto y boton "Consultar".

Descripcion:
Permite buscar un paquete escribiendo el codigo manualmente.

Pasos:
1. En "Ingresar codigo", escriba el codigo completo.
2. Pulse "Consultar".
3. Si es la primera vez, puede guardar el paquete con un nombre.
4. Pulse "Guardar y ver eventos" o "Ver eventos solo".

Resultado esperado:
- El sistema muestra la pantalla "Resultado" del codigo consultado.

### Funcion 3: Guardar paquete con nombre
Captura: ventana emergente "Add name".

Descripcion:
Guarda el paquete para verlo luego sin volver a escribir el codigo.

Pasos:
1. Luego de consultar un codigo nuevo, en la ventana emergente escriba un nombre (ejemplo: "Paquete audifonos").
2. Pulse "Save and view events".

Resultado esperado:
- Paquete guardado en "Ver guardados".
- Se muestra mensaje de exito.
- Se abre la pantalla de eventos.

### Funcion 4: Ver paquetes guardados (pendientes)
Captura: pantalla "Pendientes".

Descripcion:
Muestra paquetes guardados que aun no figuran como entregados.

Pasos:
1. En pantalla principal pulse "Ver guardados".
2. Use el buscador para filtrar por nombre o codigo (opcional).
3. Pulse un paquete para ver su detalle.
4. Pulse "Actualizar" para refrescar estados.

Resultado esperado:
- Lista filtrada y actualizada con ultimo evento de cada paquete pendiente.

### Funcion 5: Editar nombre de paquete guardado
Captura: pantalla "Pendientes" + ventana "Editar nombre".

Descripcion:
Permite cambiar el nombre visible de un paquete guardado.

Pasos:
1. Entre a "Ver guardados".
2. Pulse "Edit name" en el paquete.
3. Escriba nuevo nombre.
4. Pulse "Guardar cambios".

Resultado esperado:
- Nombre actualizado en la lista.
- Mensaje de confirmacion.

### Funcion 6: Eliminar paquete guardado
Captura: pantalla "Pendientes" con boton "Delete" + dialogo de confirmacion.

Descripcion:
Quita un paquete de la lista guardada del dispositivo.

Pasos:
1. En "Ver guardados", pulse "Delete" en el paquete.
2. Confirme en la ventana emergente.

Resultado esperado:
- El paquete desaparece de la lista.
- Mensaje de eliminacion.

### Funcion 7: Ver paquetes entregados
Captura: pantalla "Pendientes" (boton flotante con icono de caja) + pantalla "Entregados".

Descripcion:
Abre el listado de paquetes que ya fueron entregados.

Pasos:
1. Entre a "Ver guardados".
2. Pulse el boton flotante amarillo (icono caja, esquina inferior derecha).
3. Revise la lista de "Entregados".
4. Pulse un registro para abrir su detalle.

Resultado esperado:
- Visualizacion de paquetes con estado de entrega completada.

### Funcion 8: Interpretar resultado del seguimiento
Captura: pantalla "Resultado" completa.

Descripcion:
Muestra estado global, progreso por etapas e historial cronologico.

Pasos:
1. Abra un resultado desde busqueda o guardados.
2. Revise bloque superior (estado y codigo).
3. Revise tarjetas de origen, destino, servicio y ultima actualizacion.
4. Revise barra de progreso del envio.
5. Revise historial por fecha/hora y oficina.

Resultado esperado:
- El usuario entiende donde esta su paquete y cual fue su ultimo movimiento.

## 6. Mensajes del sistema y que hacer

Mensajes de exito:
- "Saved successfully" / "Guardado exitosamente": paquete guardado correctamente. Accion: continuar normal.
- "Name updated": nombre actualizado. Accion: verificar en lista.
- "Package deleted": paquete eliminado. Accion: ninguna adicional.

Mensajes de advertencia/informativos:
- "Activa notificaciones": la app sugiere habilitar notificaciones. Accion: abrir ajustes y habilitar si desea alertas.
- "Nueva version disponible": existe actualizacion. Accion: pulsar "Actualizar" para abrir tienda.
- "Data saved a while ago": datos de cache con posible antiguedad. Accion: usar "Retry update".

Mensajes de error frecuentes:
- "Enter or scan a code": no se ingreso codigo. Accion: escribir o escanear codigo.
- "Invalid format": formato de codigo invalido. Accion: revisar longitud y caracteres.
- "Invalid or not found code" / "Package not found": codigo inexistente o sin registros. Accion: confirmar codigo con remitente.
- "Duplicate name": ya existe un paquete con ese nombre. Accion: usar otro nombre.
- "Could not refresh the list": no se pudo actualizar lista. Accion: reintentar con internet activo.
- "Could not update. Showing available data.": fallo actualizacion de eventos. Accion: revisar conexion y pulsar "Retry update".
- "No se pudo abrir la tienda": no se logro abrir enlace de actualizacion. Accion: abrir tienda manualmente.

Permisos:
- "Camera permission blocked": permiso camara bloqueado por el sistema. Accion: habilitar camara en ajustes del telefono.

## 7. Preguntas frecuentes (FAQ)

1. No puedo escanear el codigo, que hago?
- Verifique que la camara tenga permiso.
- Acerque o aleje el telefono hasta que el codigo sea legible.
- Si persiste, use ingreso manual.

2. El sistema dice codigo invalido o no encontrado.
- Revise que no falten letras o numeros.
- Evite espacios antes/despues del codigo.
- Si sigue igual, consulte al remitente porque puede no estar registrado aun.

3. No recibo notificaciones de cambios.
- Revise permisos de notificaciones en ajustes del telefono.
- Verifique conexion a internet.
- Abra la app y actualice manualmente el paquete.

4. Un paquete guardado desaparecio de Pendientes.
- Puede haberse movido a "Entregados".
- Ingrese al boton flotante de caja para revisarlo.
- Si fue eliminado manualmente, debe volver a consultarlo y guardarlo.

5. El historial no se actualiza al momento.
- Pulse "Actualizar" en la lista o "Retry update" en Resultado.
- Confirme que tiene internet.
- Si no hay nuevo evento en origen, el estado puede mantenerse igual por algunas horas.

6. Cambie el nombre y no se guardo.
- El nombre no puede estar vacio.
- No puede repetirse con otro paquete guardado.
- Intente con un nombre corto y unico.

7. La app muestra aviso de nueva version.
- Se recomienda actualizar para evitar errores y tener mejoras.
- Pulse "Actualizar" y complete instalacion desde la tienda.

## 8. Mantenimiento y actualizaciones

La app fue preparada para futuras actualizaciones sin perder datos locales del usuario, siempre que:
- se mantenga el mismo identificador Android: `com.colee_615.scannerapp`
- no se desinstale la app antes de instalar la nueva version
- las nuevas versiones respeten el sistema de migraciones internas

Reglas de versionado recomendadas:
- `expo.version`: version visible al usuario. Ejemplo: `1.0.0`, `1.1.0`, `1.2.0`
- `android.versionCode`: numero entero que siempre debe subir. Ejemplo: `1`, `2`, `3`
- `ios.buildNumber`: numero o texto corto que siempre debe subir. Ejemplo: `1`, `2`, `3`

Datos locales que hoy se conservan entre actualizaciones:
- paquetes guardados (`savedPackages`)
- token de notificaciones (`fcm_token`)
- cache de tracking (`tracking_cache_v2_*`)
- idioma, tema y progreso de guia

Buenas practicas para futuras versiones:
1. Si solo cambia la app visualmente o se corrigen errores, subir `expo.version` y tambien `versionCode` / `buildNumber`.
2. Si cambia el formato de datos guardados, crear una nueva migracion interna antes de publicar.
3. No cambiar las claves de `AsyncStorage` sin migracion.
4. No cambiar el `package` de Android si se quiere conservar datos y permitir actualizacion normal.
