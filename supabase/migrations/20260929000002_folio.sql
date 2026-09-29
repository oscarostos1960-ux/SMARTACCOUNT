-- Folio consecutivo por cuenta (el "Número" del sistema anterior)
alter table public.transacciones add column folio integer;
comment on column public.transacciones.folio is 'Folio consecutivo por cuenta (Número del sistema anterior). Los nuevos toman el siguiente.';

-- Folios del sistema anterior (codificados por tramos consecutivos)
update public.transacciones t set folio = s.folio_ini + (t.orden - s.orden_ini) / 2
from (values (8,2,0,1),(8,4,0,1),(8,6,0,1),(8,8,0,1),(8,10,0,1),(8,12,0,1),(8,14,0,1),(8,16,0,1),(8,18,0,1),(8,20,0,1),(8,22,0,1),(8,24,0,1),(8,26,0,1),(8,28,0,1),(8,30,0,1),(8,32,0,1),(8,34,0,1),(8,36,0,1),(8,38,0,11),(8,60,10,2),(8,64,11,2),(8,68,12,2),(8,72,13,2),(8,76,14,2),(8,80,15,2),(8,84,16,2),(8,88,17,2),(8,92,18,2),(8,96,19,2),(8,100,20,2),(8,104,21,2),(8,108,22,2),(8,112,23,2),(8,116,24,2),(8,120,25,87),(8,294,115,305),(8,904,419,5),(8,914,425,4),(8,922,430,11),(8,944,447,292),(8,1528,738,20),(8,1568,757,55),(8,1678,811,57),(8,1792,867,2),(8,1796,868,36),(8,1868,906,222),(8,2312,2014,2419),(9,2,1,303),(9,608,305,4),(9,616,310,10),(9,636,321,33),(9,702,357,89),(9,880,449,10),(9,900,460,29),(9,958,488,2),(9,962,489,2),(9,966,490,3),(9,972,492,3),(9,978,494,3),(9,984,496,3),(9,990,498,7),(9,1004,504,2),(9,1008,508,1),(9,1010,511,1),(9,1012,516,1),(9,1014,518,7),(9,1028,526,14),(9,1056,541,2),(9,1060,544,2),(9,1064,547,1),(9,1066,547,2),(9,1070,548,2),(9,1074,549,2),(9,1078,550,2),(9,1082,551,2),(9,1086,552,9),(9,1104,562,8),(9,1120,569,3),(9,1126,571,3),(9,1132,573,4),(9,1140,576,30),(9,1200,605,15),(9,1230,619,47),(9,1324,665,14),(9,1352,680,141),(10,2,0,1),(10,4,0,1),(10,6,0,1),(10,8,0,1),(10,10,0,1),(10,12,0,1),(10,14,0,1),(10,16,0,1),(10,18,0,1),(10,20,0,1),(10,22,0,1),(10,24,0,1),(10,26,0,1),(10,28,0,1),(10,30,0,1),(10,32,0,1),(10,34,0,1),(10,36,0,1),(10,38,0,112),(10,262,115,305),(10,872,419,5),(10,882,425,4),(10,890,430,11),(10,912,447,292),(10,1496,738,20),(10,1536,757,55),(10,1646,811,57),(10,1760,867,2),(10,1764,868,36),(10,1836,906,222),(10,2280,2014,2474),(10,7228,4487,9),(10,7246,4495,42),(10,7330,4538,213),(10,7756,4752,69),(10,7894,4822,2),(10,7898,4823,2),(10,7902,4824,2),(10,7906,4825,3),(10,7912,4827,216),(10,8344,5042,27),(10,8398,5068,7),(10,8412,5078,51),(10,8514,5128,2),(10,8518,5129,2),(10,8522,5130,2),(10,8526,5131,2),(10,8530,5132,2),(10,8534,5133,2),(10,8538,5134,2),(10,8542,5135,7),(10,8556,5143,275),(10,9106,5488,436),(10,9978,5923,100),(10,10178,6022,193),(10,10564,6216,691),(10,11946,6906,81),(10,12108,6988,8227),(11,2,1,1139),(12,2,1,359),(13,2,1,372),(14,2,25,1136),(14,2274,2043,1374),(14,5022,3419,1108),(14,7238,4529,17),(15,2,1,359),(15,720,365,46),(15,812,410,2),(15,816,411,78),(15,972,500,464),(15,1900,963,13),(15,1926,975,126),(15,2178,1100,12),(15,2202,1995,130),(15,2462,2124,2),(15,2466,2125,2),(15,2470,2126,2),(15,2474,2127,2),(15,2478,2128,2),(15,2482,2129,128),(15,2738,2256,160),(16,2,1,1069),(16,2140,1069,2),(16,2144,1070,2),(16,2148,1071,2),(16,2152,1072,2),(16,2156,1073,2),(16,2160,1074,2),(16,2164,1075,2),(16,2168,1076,2),(16,2172,1077,2),(16,2176,1078,2),(16,2180,1079,2),(16,2184,1080,2),(16,2188,1081,2),(16,2192,1082,2),(16,2196,1083,2),(16,2200,1084,2),(16,2204,1085,2),(16,2208,1086,2),(16,2212,1087,2),(16,2216,1088,2),(16,2220,1089,2),(16,2224,1090,2),(16,2228,1091,2),(16,2232,1092,2),(16,2236,1093,2),(16,2240,1094,2),(16,2244,1095,2),(16,2248,1096,2),(16,2252,1097,2),(16,2256,1098,2),(16,2260,1099,2),(16,2264,1100,2),(16,2268,1101,2),(16,2272,1102,2),(16,2276,1103,2),(16,2280,1104,2),(16,2284,1105,2),(16,2288,1106,2),(16,2292,1107,2),(16,2296,1108,2),(16,2300,1109,2),(16,2304,1110,2),(16,2308,1111,2),(16,2312,1112,2),(16,2316,1113,2),(16,2320,1114,25),(16,2370,1913,932),(16,4234,2844,2),(16,4238,2845,56),(16,4350,2900,400),(16,5150,3299,2),(16,5154,3300,2),(16,5158,3301,2),(16,5162,3302,2),(16,5166,3303,2),(16,5170,3304,2),(16,5174,3305,2),(16,5178,3306,2),(16,5182,3307,2),(16,5186,3308,2),(16,5190,3309,235),(16,5660,3543,90),(16,5840,3632,45),(16,5930,3676,25),(17,2,0,15),(18,2,1,1),(18,4,12,1),(18,6,303,1),(18,8,456,1),(19,2,1,1),(20,2,1,40),(20,82,44,283),(20,648,328,5055),(20,10758,5384,111),(29,2,1,234),(29,470,236,33),(29,536,271,6),(29,548,276,139),(39,2,1,2306),(57,2,1,1),(58,2,1,413),(58,828,415,1047),(60,2,1,209),(61,2,1,75),(62,2,1,75),(63,2,1,181),(64,2,3,226),(67,2,1,42),(68,2,2,101),(69,2,1,134),(70,2,1,389),(71,2,1,17),(72,2,1,68),(73,2,1,69),(74,2,1,67),(75,2,1,6),(75,14,17,18),(77,2,1,86),(78,2,1,87),(79,2,1,71),(80,2,35,46),(81,2,1,303),(82,2,1,28),(83,2,1,2),(84,2,1,16),(85,2,1,1),(86,2,1,188)) as s(legacy_cuenta, orden_ini, folio_ini, n)
where t.legacy_cuenta_id = s.legacy_cuenta and t.legacy_id is not null
  and t.orden between s.orden_ini and s.orden_ini + 2 * (s.n - 1);

-- Ajustes de migración: folio 0 (primer registro)
update public.transacciones set folio = 0 where es_ajuste and folio is null;

-- Movimientos capturados después de la migración: siguiente folio de su cuenta
with nuevos as (
  select t.id, (select coalesce(max(x.folio), 0) from public.transacciones x where x.cuenta_id = t.cuenta_id and x.legacy_id is not null)
         + row_number() over (partition by t.cuenta_id order by t.id) as f
  from public.transacciones t where t.folio is null
)
update public.transacciones t set folio = n.f from nuevos n where n.id = t.id;

alter table public.transacciones alter column folio set not null;
create index transacciones_cuenta_folio_idx on public.transacciones (cuenta_id, folio);

-- Folio automático al registrar
create or replace function public.tg_transaccion_orden()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.orden is null then
    select coalesce(max(orden), 0) + 1 into new.orden from public.transacciones where cuenta_id = new.cuenta_id;
  end if;
  if new.folio is null then
    select coalesce(max(folio), 0) + 1 into new.folio from public.transacciones where cuenta_id = new.cuenta_id;
  end if;
  return new;
end $$;
revoke execute on function public.tg_transaccion_orden() from public, anon, authenticated;

-- Vistas y búsqueda con folio
drop function public.buscar_transacciones(bigint, date, date, text, bigint, bigint, bigint, text, int, int);
drop view public.v_transacciones;
create view public.v_transacciones with (security_invoker = true) as
select
  t.*,
  c.saldo_inicial
    + sum(t.abono - t.cargo) over (partition by t.cuenta_id order by t.fecha, t.orden, t.id
                                   rows between unbounded preceding and current row) as saldo,
  co.nombre as concepto,
  coalesce(nullif(p.razon_social, ''), concat_ws(' ', p.nombre, p.apellido_paterno, p.apellido_materno)) as proveedor,
  (select coalesce(array_agg(tc.clasificacion_id order by tc.clasificacion_id), '{}')
     from public.transaccion_clasificaciones tc where tc.transaccion_id = t.id) as clasificaciones
from public.transacciones t
join public.cuentas c on c.id = t.cuenta_id
left join public.conceptos co on co.id = t.concepto_id
left join public.proveedores p on p.id = t.proveedor_id;

grant select on public.v_transacciones to authenticated;
revoke all on public.v_transacciones from anon;

create or replace function public.buscar_transacciones(
  p_cuenta bigint,
  p_desde date default null,
  p_hasta date default null,
  p_texto text default null,
  p_concepto bigint default null,
  p_proveedor bigint default null,
  p_clasificacion bigint default null,
  p_tipo text default null,          -- 'cargos' | 'abonos' | null
  p_limite int default 50,
  p_offset int default 0
) returns table (
  id bigint, cuenta_id bigint, folio integer, fecha date, orden bigint, descripcion text,
  cargo numeric, abono numeric, saldo numeric, tipo_cambio numeric,
  concepto_id bigint, concepto text, proveedor_id bigint, proveedor text,
  referencia text, leyenda1 text, leyenda2 text, leyenda3 text, observaciones text,
  transferencia_id uuid, es_ajuste boolean, aviso_whatsapp text, aviso_correo text,
  clasificaciones bigint[], total bigint, total_cargos numeric, total_abonos numeric
)
language sql stable security invoker set search_path = public, extensions as $$
  with f as (
    select v.* from public.v_transacciones v
    where v.cuenta_id = p_cuenta
      and (p_desde is null or v.fecha >= p_desde)
      and (p_hasta is null or v.fecha <= p_hasta)
      and (p_concepto is null or v.concepto_id = p_concepto)
      and (p_proveedor is null or v.proveedor_id = p_proveedor)
      and (p_clasificacion is null or v.clasificaciones @> array[p_clasificacion])
      and (p_tipo is null or (p_tipo = 'cargos' and v.cargo > 0) or (p_tipo = 'abonos' and v.abono > 0))
      and (coalesce(p_texto, '') = '' or unaccent(lower(concat_ws(' ',
            v.folio::text, v.descripcion, v.referencia, v.leyenda1, v.leyenda2, v.leyenda3, v.observaciones,
            v.concepto, v.proveedor, v.cargo::text, v.abono::text)))
          like '%' || unaccent(lower(p_texto)) || '%')
  )
  select f.id, f.cuenta_id, f.folio, f.fecha, f.orden, f.descripcion, f.cargo, f.abono, f.saldo, f.tipo_cambio,
         f.concepto_id, f.concepto, f.proveedor_id, f.proveedor, f.referencia, f.leyenda1, f.leyenda2,
         f.leyenda3, f.observaciones, f.transferencia_id, f.es_ajuste, f.aviso_whatsapp, f.aviso_correo,
         f.clasificaciones,
         count(*) over (), coalesce(sum(f.cargo) over (), 0), coalesce(sum(f.abono) over (), 0)
  from f
  order by f.fecha desc, f.orden desc, f.id desc
  limit greatest(least(p_limite, 5000), 1) offset greatest(p_offset, 0)
$$;
revoke execute on function public.buscar_transacciones(bigint, date, date, text, bigint, bigint, bigint, text, int, int) from public, anon;
grant execute on function public.buscar_transacciones(bigint, date, date, text, bigint, bigint, bigint, text, int, int) to authenticated;
