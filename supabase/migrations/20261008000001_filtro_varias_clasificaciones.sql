-- Filtro por varias clasificaciones a la vez, con "O" (cualquiera) o "Y" (todas).
-- Funciones nuevas (_v2): las anteriores se quedan tal cual para que la versión publicada siga funcionando.

create function public.filtrar_movimientos_v2(
  p_cuentas bigint[] default null, p_desde date default null, p_hasta date default null, p_texto text default null,
  p_concepto bigint default null, p_proveedor bigint default null, p_clasificacion bigint default null,
  p_tipo text default null, p_clasificaciones bigint[] default null, p_clasif_todas boolean default false
) returns setof public.v_transacciones
language sql stable security invoker set search_path = public, extensions as $$
  select v.* from public.v_transacciones v
  cross join lateral (select coalesce(nullif(p_clasificaciones, '{}'),
                                      case when p_clasificacion is not null then array[p_clasificacion] end) as lista) c
  where (p_cuentas is null or v.cuenta_id = any (p_cuentas))
    and (p_desde is null or v.fecha >= p_desde)
    and (p_hasta is null or v.fecha <= p_hasta)
    and (p_concepto is null or v.concepto_id = p_concepto)
    and (p_proveedor is null or v.proveedor_id = p_proveedor)
    and (c.lista is null
         or (coalesce(p_clasif_todas, false) and v.clasificaciones @> c.lista)
         or (not coalesce(p_clasif_todas, false) and v.clasificaciones && c.lista))
    and (p_tipo is null or (p_tipo = 'cargos' and v.cargo > 0) or (p_tipo = 'abonos' and v.abono > 0))
    and (coalesce(p_texto, '') = '' or unaccent(lower(concat_ws(' ',
          v.folio::text, v.descripcion, v.referencia, v.leyenda1, v.leyenda2, v.leyenda3, v.observaciones,
          v.concepto, v.proveedor, v.cargo::text, v.abono::text)))
        like '%' || unaccent(lower(p_texto)) || '%')
$$;

create function public.buscar_movimientos_v2(
  p_cuentas bigint[] default null, p_desde date default null, p_hasta date default null, p_texto text default null,
  p_concepto bigint default null, p_proveedor bigint default null, p_clasificacion bigint default null,
  p_tipo text default null, p_orden text default 'folio', p_limite integer default 50, p_offset integer default 0,
  p_clasificaciones bigint[] default null, p_clasif_todas boolean default false
) returns table (
  id bigint, cuenta_id bigint, cuenta text, moneda text, folio integer, fecha date, descripcion text,
  cargo numeric, abono numeric, saldo numeric, tipo_cambio numeric, concepto_id bigint, concepto text,
  proveedor_id bigint, proveedor text, referencia text, leyenda1 text, leyenda2 text, leyenda3 text,
  observaciones text, transferencia_id uuid, es_ajuste boolean, aviso_whatsapp text, aviso_correo text,
  clasificaciones bigint[], documentos integer, total bigint
)
language sql stable security invoker set search_path = public as $$
  select f.id, f.cuenta_id, f.cuenta, f.moneda, f.folio, f.fecha, f.descripcion, f.cargo, f.abono, f.saldo,
         f.tipo_cambio, f.concepto_id, f.concepto, f.proveedor_id, f.proveedor, f.referencia, f.leyenda1,
         f.leyenda2, f.leyenda3, f.observaciones, f.transferencia_id, f.es_ajuste, f.aviso_whatsapp,
         f.aviso_correo, f.clasificaciones, f.documentos, count(*) over ()
  from public.filtrar_movimientos_v2(p_cuentas, p_desde, p_hasta, p_texto, p_concepto, p_proveedor, p_clasificacion, p_tipo,
                                  p_clasificaciones, p_clasif_todas) f
  order by
    case when p_orden = 'fecha' then f.fecha end desc,
    case when p_orden = 'fecha' then f.cuenta end,
    f.folio desc, f.orden desc, f.id desc
  limit greatest(least(p_limite, 5000), 1) offset greatest(p_offset, 0)
$$;

create function public.totales_movimientos_v2(
  p_cuentas bigint[] default null, p_desde date default null, p_hasta date default null, p_texto text default null,
  p_concepto bigint default null, p_proveedor bigint default null, p_clasificacion bigint default null,
  p_tipo text default null, p_clasificaciones bigint[] default null, p_clasif_todas boolean default false
) returns table (moneda text, movimientos bigint, cargos numeric, abonos numeric)
language sql stable security invoker set search_path = public as $$
  select f.moneda, count(*), coalesce(sum(f.cargo), 0), coalesce(sum(f.abono), 0)
  from public.filtrar_movimientos_v2(p_cuentas, p_desde, p_hasta, p_texto, p_concepto, p_proveedor, p_clasificacion, p_tipo,
                                  p_clasificaciones, p_clasif_todas) f
  group by f.moneda order by f.moneda
$$;

revoke execute on function public.filtrar_movimientos_v2(bigint[], date, date, text, bigint, bigint, bigint, text, bigint[], boolean),
  public.buscar_movimientos_v2(bigint[], date, date, text, bigint, bigint, bigint, text, text, int, int, bigint[], boolean),
  public.totales_movimientos_v2(bigint[], date, date, text, bigint, bigint, bigint, text, bigint[], boolean) from public, anon;
grant execute on function public.filtrar_movimientos_v2(bigint[], date, date, text, bigint, bigint, bigint, text, bigint[], boolean),
  public.buscar_movimientos_v2(bigint[], date, date, text, bigint, bigint, bigint, text, text, int, int, bigint[], boolean),
  public.totales_movimientos_v2(bigint[], date, date, text, bigint, bigint, bigint, text, bigint[], boolean) to authenticated;
