import type {VercelRequest,VercelResponse} from '@vercel/node';
import {methodNotAllowed} from './_shared.js';

export default function handler(req:VercelRequest,res:VercelResponse){
 if(req.method!=='GET')return methodNotAllowed(res,['GET']);
 const host=String(req.headers['x-forwarded-host']||req.headers.host||'zevenra.vercel.app'),proto=String(req.headers['x-forwarded-proto']||'https').split(',')[0],origin=`${proto}://${host}`;
 res.status(200);res.setHeader('Content-Type','text/plain; charset=utf-8');res.setHeader('Cache-Control','public, s-maxage=3600, stale-while-revalidate=86400');
 return res.send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /account\nSitemap: ${origin}/sitemap.xml\n`)
}
