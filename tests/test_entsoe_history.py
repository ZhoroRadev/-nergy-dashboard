import datetime as dt
import importlib.util
import pathlib
import unittest

FILE = pathlib.Path(__file__).resolve().parents[1] / 'scripts' / 'entsoe_history.py'
spec=importlib.util.spec_from_file_location('entsoe_history', FILE)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class HistoryTests(unittest.TestCase):
    def example(self, t):
        return {'schema_version':1,'mode':'metadata_only','checked_at_utc':t,
                'dam':{'status':'ok','intervals':12,'earliest_interval_utc':'2026-11-06T00:00:00+00:00','latest_interval_utc':'2026-11-07T00:00:00+00:00'},
                'generation':{'status':'ok','intervals':10,'production_type_count':5,'earliest_interval_utc':'2026-11-06T00:00:00+00:00','latest_interval_utc':'2026-11-06T10:00:00+00:00'}}
    def test_slim_metadata_only(self):
        entry=mod.slim(self.example('2026-11-06T12:00:00+00:00'))
        self.assertEqual(entry['dam']['intervals'],12)
        self.assertNotIn('dam_eur_mwh',str(entry))
        self.assertNotIn('generation_mw',str(entry))
    def test_dedup_and_bad_entries(self):
        t='2026-11-06T12:00:00+00:00'
        e=mod.slim(self.example(t))
        got=mod.merge([e,{'bad':'unknown'}],e,now=dt.datetime(2026,11,6,14,tzinfo=dt.timezone.utc))
        self.assertEqual(len(got),1)
    def test_fails_closed(self):
        d=self.example('2026-11-06T12:00:00+00:00');d['dam']['status']='failed'
        with self.assertRaises(ValueError):mod.slim(d)

if __name__=='__main__':unittest.main()
