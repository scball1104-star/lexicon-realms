"""The phone playthrough (phone.py) on the smaller phone, 667x375 landscape (wave 9 fixes). There the Builds 2 talents
window shows tabs (Strengths, Weaknesses, Skills): this run checks it opens on the gold star's tab and that a node on the
other tab is a tap of its tab away. Screenshots in qa/out/integrate/phone_667x375/.

    PORT=<port> python qa/integrate/phone_se.py

Prints PHONE_DONE: ok=<bool> errors=<n> (as phone.py does).
"""
import os, runpy

os.environ['PHONE_VIEW'] = '667x375'
runpy.run_path(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'phone.py'), run_name='__main__')
